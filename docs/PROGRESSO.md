# Progresso e pendências

Registro vivo do que foi feito, por quê, e do que falta. Atualize ao concluir
uma etapa (mova o item para "Concluído", com data e commit).

## Prioridades em aberto

| # | Item | Gravidade | Esforço |
|---|------|-----------|---------|
| 1 | Segurança: RLS desligado + login em texto puro | **Crítica** | Grande, em etapas |
| 1b | ~~Desempenho credita pela atribuição atual — Fase 2 (telas)~~ | Alta | Médio |
| 1c | ~~Regras de "pendente/pago" divergentes (desconto, coluna `status`)~~ | Média | Pequeno/médio |
| 2 | ~~Reagendamento atômico (RPC)~~ | Média | Pequeno/médio |
| 3 | Trocar exclusão de visitas por cancelamento | Média | Pequeno |
| 4 | Modelagem de `scheduled_visits` | Baixa/média | Médio, incremental |
| 5 | Quebrar componentes gigantes | Baixa | Contínuo |
| 6 | `RouteMap` não detecta reagendadas | Baixa | Pequeno |
| 7 | Vulnerabilidades restantes (só dev) | Baixa | — |
| 8 | ~~Escopo completo do gestor baixa `BANCO_DADOS` inteiro pro navegador~~ | Média | Médio |
| 9 | Status "A Vencer" não existe hoje — avaliar relação com os demais | Baixa | A analisar |
| 10 | ~~Etapa 3 — tipar `BANCO_DADOS` (FK `documento`/dinheiro `numeric`/datas `date`)~~ | Média | Grande, em 3 fases |
| 11 | ~~Título de acordo ativo pagável por fora (Distribuir Pagamento/CollectionModal/upload)~~ | Alta | Pequeno/médio |
| 12 | Atraso ciente de acordo ativo + Termo de Acordo automático (ver detalhe abaixo) | Alta | Grande, em etapas |
| 13 | ~~Agendamento de contato pro cobrador de carteira (interno/terceirizado/jurídico)~~ | Alta | Grande, em etapas |
| 14 | ~~Guard de agendamento ativo ausente em `atribuir_clientes_em_lote`/`remover_cobrador_em_lote`~~ | Alta | Pequeno |
| 15 | ~~Transferência de carteira em massa não filtra agendamento por canal~~ | Alta | Pequeno/médio |
| 16 | ~~Cobrador de carteira não tem como cancelar um contato agendado (só concluir/reagendar)~~ | Média/Alta | Médio |
| 17 | ~~Duas implementações de "desfecho libera cliente da carteira" (visitOutcomes vs. `if` no LogContactModal)~~ | Média | Pequeno/médio |
| 18 | ~~`AllowedVisitDatesManager` aceita os 4 perfis mas só `VisitScheduler` (externo) lê o resultado~~ | Média | Pequeno |
| 19 | ~~`monthly_goals.visits_goal` muda de significado por perfil sem isso aparecer no schema/UI do %~~ | Média | Pequeno |
| 20 | ~~Helper `WALLET_COLLECTOR_TYPES.includes(...)` repetido em 6+ lugares em vez de `isWalletCollectorType()` único~~ | Baixa | Pequeno |
| 21 | Jurídico (`legal_collector`) é 100% idêntico a Interno/Terceirizado — zero modelagem de processo/protesto/prazo legal | A avaliar com o negócio | A analisar |
| 22 | ~~Sem histórico de cancelamento de acordo e de agendamento~~ — bloco "Acordos e agendamentos cancelados" no Histórico da ficha, 2026-11-10 (item 45) | Baixa/Média | Pequeno/médio |
| 23 | `AcordoModal` (parcelas) não bloqueia de verdade data anterior a hoje — só `min` do `<input type="date">`, sem validação no "Continuar" | Baixa | Pequeno |
| 24 | Registrar contato + Reagendar + Agendar viram um botão só, "Atender" (RPC `registrar_contato`; modal em 2 etapas em 2026-11-06) — RPC testada ao vivo; front publicado e 2 etapas conferidas no site (2026-11-09) — falta uma submissão real | Média | Médio |
| 25 | Distribuição da carteira por regra (faixas × lojas, várias por cobrador, ativa/pausada) — migrations 6–10 aplicadas; regras da Monalisa e do José cadastradas e 1ª distribuição aplicada em 2026-11-06 | Alta | Grande |
| 26 | Razão social + contato/vendedor/região do Ciclone no cadastro do cliente — migration, sync e front no ar (2026-11-06); gestor testado na tela e cobrador/Termo conferidos por código+dados; "Atender" e agenda de contato com razão social/"Falar com" (`cf68ed7`); publicado (push 2026-11-09) — falta ver o PDF do Termo; telefone do ERP no card e saudação do WhatsApp a decidir | Média | Pequeno/médio |
| 27 | ~~Detalhes do Cliente: parcela paga/atrasada decidida pelo texto do status ("recebido" do Ciclone aparecia atrasado)~~ — `15e780a`, publicado e testado no site 2026-11-09 | Alta | Pequeno |
| 28 | ~~Busca por CPF/CNPJ exigia a máscara~~ — `f756638`, publicado 2026-11-09 (histórico de Autorizações, busca no servidor, ficou de fora) | Baixa | Pequeno |
| 34 | ~~Carteira mostrava saldo total (vencido + a vencer) como "pendente"~~ — vencido em destaque + "a vencer" separado, selo "Em dia", aviso de loja desatualizada na Distribuição (2026-11-09); falta `db push` da `20261109000006` e teste na tela | Média/Alta | Médio |
| 33 | Distribuição: tirar cliente de outra carteira só com o gestor marcando o cobrador (checkbox na simulação); "regra mestre" (`0003`) desfeita sem ter sido usada; inativo libera a carteira (`0004`, aplicado) — migration `0005` pronta, falta `db push` e teste na tela | **Alta** | Médio |
| 31 | ~~Detalhes do Cliente: abas Todos / Em aberto / Pagos na lista de vendas~~ — 2026-11-09 | Média | Pequeno |
| 32 | ~~WhatsApp: mensagem com o valor só em atraso + reaproveitar a mesma aba do WhatsApp Web no computador~~ — 2026-11-09 | Média | Pequeno |
| 30 | "Distribuir Pagamento" dá 400 em venda do Ciclone com número > 2.147.483.647 (parâmetro/coluna `integer`; 562 clientes com saldo afetados) — migration `20261109000002` aplicada 2026-11-09, `check:db` OK; falta o usuário repetir o pagamento real | **Alta** | Pequeno |
| 29 | Código do cliente do Ciclone (`pgcln_codigo`) no cadastro — migration `20261109000001` aplicada + `check:db` OK, sync rodado (1.888 clientes com código); falta publicar o front e testar na tela | Média | Pequeno |
| 39 | Fila de Cobrança: gestor define, na Distribuição, quantos clientes de cada faixa a cada rodada da lista "Ligar" (manhã/tarde opcional) — etapa 1 (configuração) commitada, `0010` aplicada; ordenação e faixa de dívida por faixa (`0011` aplicada); etapa 2 (lista intercalada + "Deixar para depois") feita, `0012` aplicada, `0013` (só INSERT/SELECT no privilégio) aplicada, falta teste na tela; etapa 3 (supervisão) não iniciada | Alta | Grande, em etapas |
| 40 | Fila de Cobrança em lotes substitui a Agenda do cobrador de carteira (lote = soma das quantidades do gestor; próximo só com o atual todo registrado) + filtros da Agenda na Carteira completa — código feito 2026-11-10, migration `20261110000003` aplicada (`check:db` OK), 1º lote do José conferido no banco (5/2/2/1); falta teste completo na tela e push | Alta | Grande |
| 41 | Gestor atende e faz acordo pelo cobrador (escolhe "em nome de": cobrador da carteira ou ele) — botões no detalhe do cliente (Cobranças etc.); migration `20261110000004` aplicada (`check:db` OK); falta teste na tela e push | Alta | Médio |
| 42 | ~~`CollectionModal` grava status/recebimento/tentativa direto, sem RPC~~ — era código morto (nenhuma tela abria); removido com o `addAttempt` do contexto em 2026-11-10 (item 43, etapa 3) | Média | Pequeno/médio |
| 43 | Ficha do cliente única (`ClientDetailModal`) — 4 etapas feitas 2026-11-10 (sem push, sem teste do usuário) | Média | Médio, em etapas |
| 44 | Carregamento parcial/inconsistente (precisava de F5 2–3 vezes) — nova tentativa em erro passageiro, sem lista incompleta, caches das derivações por carga, corrida da carga de títulos; feito 2026-11-10, sem teste no navegador (extensão caiu), sem push | Alta | Médio |
| 45 | Acordo cancelado: quem cancela escolhe estornar (refazer) ou manter (desistiu) o valor pago + histórico de acordos/agendamentos cancelados — `0005`/`0006` aplicadas (entrada da OTICA FERNANDA estornada); falta teste na tela | Alta | Médio |
| 46 | Atender: "Cliente diz que já pagou" (comprovante → registro do pagamento) e "Cliente informa venda cancelada" (parcelas da venda vão para conferência do gestor) — migration `20261110000008` aplicada (`check:db` OK); falta teste na tela | Alta | Médio |
| 47 | Lentidão/travamento do cobrador — 5 correções de front (`a7d7874`, `33e2278`, `cb749d1`, `3161703`, `af7f311`) + índice `20261111000001` (aplicado), 2026-11-11; sem push, sem teste no navegador | Alta | Pequeno |
| 48 | Gestor: números errados depois de sair e entrar na mesma aba (só quitados) + travamento ao trocar de aba (Desempenho ~32 s, Lojas, Cobranças) — `831d182`, `96fb4f8`, `c563f22`, `63aaef6`, `87439e5`, 2026-11-11; testado no build de produção, sem push | Alta | Pequeno |
| 50 | Desempenho do Cedrus (sistema anterior) → app: José importado 2026-11-11 (33 parcelas como `sale_payments` forma "Cedrus" + 3 estornos); aba Conferência de recebimentos no Resumo (`af80e81`, migration `20261111000002` sem db push); Monalisa/Jonathan/Aline com prévia pronta, gravação aguardando liberação | Alta | Médio, por cobrador |

## Perguntas em aberto para o financeiro

Lista viva: o usuário leva ao financeiro (Márcia) e traz as respostas. Ao
responder, mover a resposta para a seção do assunto e riscar aqui.
**Versão com um exemplo real do Ciclone por pergunta** (nomes de clientes e
valores — por isso fora deste repositório):
`Projetos_Dev/Ciclone/Esquema_SQL/saidas/perguntas_financeiro_2026-11-06.md`.
Já respondido pelos dados: na 10, cartão e BLU não duplicam (o título novo
fica no nome da operadora, que o sync ignora) — só o cheque fica em aberto;
na 12, a entrada é a parcela 1 dos títulos novos, baixada por Pix no mesmo
dia numa baixa separada (183 de 207) — só confirmar.

**Quebra do acordo** (mensagem do financeiro em 2026-11-06: "as parcelas
pagas ficam baixadas e as a vencer ficam em aberto correndo juros 7")
1. "Juros 7" é **7% ao mês**? A configuração atual dos acordos usa **8% a.m.**
   — é a mesma taxa (erro de digitação) ou uma taxa só para depois da quebra?
2. As parcelas a vencer **mantêm o vencimento** (não vence tudo de uma vez)?
3. Os juros correm sobre a **parcela inteira** (que já tem juros embutidos =
   juros sobre juros) ou **só sobre a parte de valor original**?
4. Parcela atrasada depois da quebra leva **multa** também, ou só juros?
5. Depois da quebra o cliente ainda pode **pagar as parcelas do acordo
   quebrado**, ou só via novo acordo/SPC? (Hoje o app fecha o acordo
   quebrado e não aceita mais pagamento nele.)

**Formas de pagamento do Ciclone que não são dinheiro** (hoje contam como
"recebido" no app; renegociação e desconto já foram corrigidos na etapa 3a)
6. **DEVOLUÇÃO** (24 baixas, R$ 79,6 mil): é mercadoria devolvida abatendo a
   dívida? Então não é recebimento — confirmar.
7. **PERCAS** (12 baixas, R$ 102,7 mil): é baixa por perda (dívida
   considerada incobrável)? Não é recebimento — confirmar.
8. **CRÉDITO EM CARTEIRA** (7 baixas, R$ 15,2 mil): o que é? Crédito que o
   cliente já tinha (adiantamento/devolução anterior)?
9. **TAXA DE ANTECIPAÇÃO** (142 baixas, R$ 42,3 mil), **TAXA OPERADORA
   CARTÃO** (3, R$ 7,2 mil) e **TAXA DE BOLETO** (1, R$ 700): são a tarifa
   descontada do valor? O recebido deve ser o líquido (sem a taxa)?
10. **CHEQUE / CARTÃO DE CRÉDITO / BLU** geram um título novo ao baixar
    (cheque em carteira, recebível do cartão). O dinheiro conta como recebido
    na baixa do título original ou só quando o cheque/cartão compensa?
    (Hoje pode aparecer duas vezes: recebido no original e dívida no novo.)

**Lançamento do acordo do app no Ciclone (etapa 3b)**
11. Ao lançar a renegociação, a Márcia segue **exatamente as parcelas do
    acordo do app** (quantidade, valores, vencimentos)? Se ela precisar
    mudar algo, quem decide e o app deve aceitar a versão do Ciclone?
12. A **entrada via Pix** entra na mesma baixa de renegociação (como parcela 1
    já paga) ou é baixada depois, no título novo da parcela 1?
13. Depois do lançamento, o cliente paga **os boletos gerados no Ciclone**
    (e o app só acompanha), ou o cobrador também registra pagamento no app?

### Publicação 2026-11-09

Push de 13 commits (`47f2503`…`15e780a`) para a `master` → Vercel. Antes do
push: 102/102 migrations locais aplicadas em produção (conferido via
`supabase_migrations.schema_migrations`) e `npm run build` OK. Entraram no ar
juntos: quadro "Lançamento no Ciclone" (acordo), "Atender" (item 24),
distribuição da carteira (item 25), remoção de `users.password`, item 26,
item 27 e item 28.

**Testado no site publicado em 2026-11-09** (cobrador interno, só leitura;
conferido no banco que nada foi gravado): busca por CPF/CNPJ só com números
(carteira e agenda de contato), razão social na busca, "Ver Vendas" com
parcelas recebidas do Ciclone verdes e sem atraso e "Maior atraso" igual ao
card da carteira, "Atender" com razão social + "Falar com" e as 2 etapas
(fechado sem gravar). Todos OK. Observação: cliente usado no teste do gestor
não tinha cobrador (por isso não aparecia na carteira) — não é defeito.

### Item 39 — Fila de Cobrança — etapa 1 em 2026-11-09

Pedido do Fábio/Jaqueline (modelo do Cedrus): o gestor organiza o trabalho
do cobrador de carteira sem ele trocar filtro — faixas intercaladas numa
proporção (ex.: a cada 10, 5 de 3–60, 2 de 61–90, 2 de 91–365, 1 de 366+),
com regras diferentes de manhã e de tarde.

**Decisões fechadas com o usuário:**
- Dentro da faixa, ordem de hoje (maior atraso primeiro).
- A fila é a lista de hoje (aba "Ligar"), não um modo "um cliente por vez".
- "Para hoje" (retornos, promessas, acordo quebrado) segue no topo, fixo.
- Manhã/Tarde (virada às 12h) é opcional, o gestor liga; padrão desligado.
- Sem configuração a lista fica como hoje (fila desligada).
- Etapa 2: "Deixar para depois" na linha, motivo de lista curta, cliente
  vai para o fim da lista de hoje.

**Etapa 1 (feita, sem commit):** peso na própria regra
(`collector_overdue_ranges.fila_peso`/`fila_peso_tarde`), mudança por versão
nova (histórico de quem mudou). RPC `definir_fila_cobranca` grava todas as
regras do cobrador de uma vez; `salvar_regra_carteira` e
`definir_regra_carteira_ativa` (corpo de produção) passam a carregar o peso
para a versão nova. Testada em produção dentro de transação revertida (anon
recusado, validações, versões, desligar). Tela: bloco "Fila da lista
Ligar" no cartão de cada cobrador com 2+ faixas ativas na Distribuição,
com prévia da ordem. Regra única em `src/filters/filaCobranca.ts`
(`intercalarPorPeso` = round-robin ponderado suave; 5/2/2/1 dá
A B C A A D A B C A). Peso 0 = fim da lista no turno; faixa nova sem peso
vale 1.

**`0010` aplicada 2026-11-09** (`db push` do usuário, `check:db` OK).

**Ordenação e faixa de dívida (pedido após ver o "Grupo do Contato Ativo" do
Cedrus, onde cada grupo tem ordenação própria e faixa de saldo):** migration
`20261109000011` — por regra, `fila_ordem` (`atraso` padrão / `valor` = maior
dívida vencida primeiro) e `fila_saldo_min`/`fila_saldo_max` (dívida
**vencida**, R$; fora do valor o cliente vai para o fim da lista, não sai da
carteira). As três RPCs (corpo de produção da 0010) carregam as colunas.
Testada em transação revertida. Tela: colunas "Ordenar por" e "Dívida
vencida de/até" no bloco da fila. `montarFilaLigar` (filters/filaCobranca)
já monta a lista: intercaladas → tentou hoje → fim (sem faixa / fora do
valor / peso 0) → em dia → deixados para depois; conferida com cenário
fictício.

`0011` aplicada 2026-11-09 (`check:db` OK).

**Etapa 2 (feita, 2026-11-09):** aba "Ligar" do cobrador de carteira usa
`montarFilaLigar` quando o gestor ligou a fila (sem coluna clicada no
cabeçalho); turno reavaliado a cada minuto (muda sozinho às 12h); aviso
"Ordem definida pela gestão (manhã/tarde)" acima da lista. Sem fila, a
ordem é a de antes. **Deixar para depois**: botão "Depois" só na aba
Ligar → modal com 3 motivos (pediu para ligar mais tarde / sem telefone
válido / outro, com texto obrigatório) → selo "Deixado para depois: …" e
o cliente vai para o fim da lista só hoje (com ou sem fila). Tabela
`fila_adiamentos` (migration `20261109000012`): só INSERT/SELECT, RLS —
cobrador grava só cliente da própria carteira, só no dia de hoje; gestor lê
tudo. Testada como cobrador (`SET ROLE authenticated`) em transação
revertida. Hook `src/hooks/useFilaAdiamentos.ts` (fora do contexto).

`0012` aplicada 2026-11-09 (`check:db` OK).

**Achado (geral, não corrigido):** o default do Supabase dá a `authenticated`
todos os privilégios nas tabelas do `public`, inclusive `TRUNCATE` (que
ignora RLS) — visto em `collection_attempts` e na `fila_adiamentos` nova.
Pelo app não é explorável (PostgREST não executa TRUNCATE), mas é defesa a
menos; a `20261109000013` fecha só na `fila_adiamentos`. Avaliar revogar
`TRUNCATE`/`REFERENCES`/`TRIGGER` de `authenticated` em todas as tabelas e
incluir a checagem no `check:db`.

`0013` aplicada 2026-11-09 (`check:db` OK; só INSERT/SELECT conferido).

**Tela da Distribuição reorganizada (2026-11-10):** regras como texto com
Editar/Desativar/Remover; cobradores em sanfona (fechado mostra faixas,
tamanho da carteira e resumo da fila; abre sozinho se há edição em
andamento); "Configurar fila" virou modal; sem regra numa caixa só. Cobertura
com uma barra por loja (escala raiz quadrada + régua) e seletor "Com falha
na cobertura | Todas as lojas" (falha = buraco entre faixas, conflito, ou
loja com clientes sem faixa ativa; antes da 1ª/depois da última faixa é só
informação). Migration `20261109000014` (`carteira_por_cobrador()`, leitura,
SECURITY INVOKER) aplicada, `check:db` OK. Visto ao vivo: 6 lojas sem
cobrador entre ~61/91 e 365 dias.

**Falta:** teste na tela do cobrador (aba Ligar intercalada → Depois);
etapa 3 (supervisão: previstos × trabalhados por faixa; referência é o
HTML do Cedrus que está na raiz, fora do Git).

### Item 50 — Desempenho do Cedrus → app — 2026-11-11

Os cobradores trabalharam no Cedrus antes do app; o usuário quer que o
recebido de lá conte no desempenho. Exports em `Dados_Cedrus/` (fora do Git:
tem dado de cliente).

**O que os arquivos permitem:** `COD_DEVEDOR` do Cedrus = `clientes.codigo_cliente_erp`
(casou ~100%, CNPJ conferido). Contato: só o ÚLTIMO por cliente (sem
histórico). Recebido com operador: `ANALISE_NEGOCIACOES` (export filtrado
para pagamentos de 03 a 10/11/2026). O título original do acordo
(`.:.<n>`) é o número da venda no Ciclone (`BANCO_DADOS.numero_titulo`).

**Decisão (usuário):** vale só o valor recebido; é o mesmo caso do cliente
que paga na loja e o gestor passa o pagamento para o cobrador — registrar em
nome dele em `sale_payments`, sem duplicar. Aparece no Caixa Diário.

**Feito para o José (dados direto em produção, não em migration — tem dado
de cliente):** 33 parcelas como `sale_payments` (`payment_method = 'Cedrus'`,
data/valor do Cedrus, mora em `juros_amount`, nota com o nº do acordo,
insert direto: não baixa título — o Ciclone já baixou). As 8 parcelas que ele
já tinha lançado no app ficaram de fora (cliente + valor com juros + até 10
dias, ou `NEG-<acordo>` citado na observação). Conferência: 30.056,50 do
relatório = 22.771,33 importados + o que ele já lançou. 3 estornos (registro
novo com `estorno_de`, juros 0 — `sale_payments_juros_amount_nao_negativo`):
1 lançamento no cliente errado, 2 lançamentos repetidos em 11/11. Os juros
desses 3 continuam no original (mesmo comportamento de
`registrar_ajuste_recebimento`; o Resumo soma só `payment_amount`).

**Cuidado no script da Management API:** o JSON do SQL tem que ser montado
em UTF-8 (`sys.stdin.buffer...decode("utf-8")`); no Windows o padrão cp1252
corrompe acento ao gravar.

**Venda (`sale_number`) das importadas:** a do título que o Ciclone de fato
baixou para o cliente perto da data (3 dias antes a 10 depois; depois 30
dias; mais de uma → valor mais próximo). O título original do acordo no
Cedrus nem sempre é a venda baixada (acordo renegociado gera título novo; nas
outras lojas o original nem é número de venda do Ciclone). Sem baixa → vazio.
6 do José corrigidas depois da gravação (`update` só do vínculo).

**Base do Ciclone guarda só o principal:** `valor_recebido` sem juros
(`juros_pago` vem vazio). O Cedrus põe os juros do acordo dentro do valor da
parcela, então "app um pouco maior que a base" é juros, não erro.

**Painel (aba "Conferência de recebimentos" no Resumo por Cobrador,
`af80e81`):** RPC `conferencia_recebimentos(p_inicio, p_fim)` (SECURITY
INVOKER, leitura) — por cliente no mês: baixado na base × registrado no app
(`sale_payments` sem "Ajuste Administrativo", estornos incluídos, +
`acordo_pagamentos`). Cliente fica com quem registrou; sem registro, com o
dono da carteira (ou "Sem cobrador"). Situações em
`filters/conferenciaRecebimentos.ts`: confere (±R$ 1), pagou sem registro,
registrado sem baixa, app maior, base maior. Migration `20261111000002`
**sem db push**; depois do push rodar `npm run check:db` e testar a aba.

**Outros cobradores (mesmo relatório):** Monalisa 56 parcelas R$ 7.956,66
(1 já no app), Jonathan 44 R$ 6.013,79 (4 já no app), Aline 2 R$ 280,00.
Clientes casam 100% pelo CNPJ. Prévia conferida; a gravação foi barrada pela
permissão automática — aguardando o usuário liberar.

**Falta:** db push + teste da aba; gravar os outros 3; push.

### Item 47 — Lentidão do cobrador — 2026-11-11

Relato: cobradores reclamando de demora para carregar e travamentos.
Medido no banco (EXPLAIN ANALYZE como cobrador de carteira, em transação
desfeita) e no código:

1. **Carga da carteira** (`loadCollectionsOnce`): só o perfil `collector`
   mandava filtro de cobrador (e ainda um `or` com `nome_da_loja.in.()`
   vazio); os 3 de carteira não mandavam nenhum e contavam só com a RLS.
   A policy `select_dono_ou_gestor` é `gestor OR user_id = eu` — atrás do
   OR o Postgres não usa `idx_banco_dados_user_id`: cada página de 1000
   varria a PK descartando ~130 mil linhas (**~600–700 ms por página**).
   Agora todo perfil não gestor manda `user_id = eu` explícito (mesmo
   resultado da RLS): **~50 ms por página**. `a7d7874`.
2. **Contatos da carteira na Fila** (`InternalCollectorWallet`): lia
   `collection_attempts` em lotes de 300 ids **em sequência** (~30–45
   requisições para carteiras de 9–13 mil parcelas), no boot **e a cada
   registro** (`versaoRegistros`). Cobrador agora faz uma leitura paginada
   (a RLS já limita à carteira dele; ~160 linhas, ~16 ms) e filtra pelos
   títulos em aberto no cliente; gestor continua por id. `33e2278`.
3. **Atender** (`LogContactModal`): todo registro chamava
   `refreshCollections()` (baixar a carteira inteira de novo), que por
   sua vez disparava o item 2. `registrar_contato` só grava
   `collection_attempts`/`scheduled_visits` — só mexe em `BANCO_DADOS`
   quando libera o cliente (`liberar_cliente_da_carteira`). Agora recarrega
   a carteira só nesse caso e na venda cancelada. `cb749d1`.

4. **Agendamento** (`prefetchClientsData`/`getClientDataForVisit`):
   `activeAddressHistory.find` (15 mil endereços) e `clientGroups.find`
   dentro do laço por cliente → índices `Map` por documento. `3161703`.
5. **Renders do contexto**: `getCollectorCollections`,
   `getFilteredCollections`, `getVisitsByCollector` e os dois
   `getAcordo*DoCliente` eram funções soltas (identidade nova a cada render
   do provider — o `value` não é memoizado). A carteira do cobrador
   (`myCollections`) e a fila têm essas funções nas deps: qualquer
   mudança de estado do contexto refiltrava 10k+ parcelas e **relia os
   contatos no servidor**. Agora `useCallback` com as deps certas (lint
   `exhaustive-deps` sem aviso novo). `af7f311`.
6. Migration `20261111000001`: índice `(user_id, id_parcela)` em
   `BANCO_DADOS` (troca o só-`user_id`, que fica redundante) — a página
   da carteira passa a ser leitura direta em vez de ler as ~9–13 mil
   parcelas do cobrador e ordenar. **Aplicada 2026-11-11**, `check:db` OK; página de 1000 caiu de ~650 ms (original) para ~6 ms. Independe do
   front (pode ir antes ou depois).

**Próximos passos (medidos, não feitos):**
- Boot do cobrador também baixa `enderecos_historico` inteiro (15 mil
  linhas, RLS `true`, ~180 ms + transferência) e `users` inteiro.
- Realtime: qualquer mudança em `BANCO_DADOS` visível ao cobrador (sync do
  Ciclone 3x/dia) recarrega a carteira inteira dele — já com debounce.
- Não medido: custo de renderização no celular (derivações sobre 10k+
  parcelas no `CollectionContext`).

**Push feito 2026-11-11** (`fa190b3`). **Teste no navegador** (dev local,
mesmo código): José (8.867 parcelas) abre em 1,9–2,7 s; contatos da fila
em 1 requisição; trocar Fila ↔ Carteira completa não faz requisição
nenhuma. Cobrador Externo Teste: Atender "não atende" gravou 9 tentativas
+ 1 agendamento, fila foi de 7 para 6 e **a carteira não foi baixada de
novo** (só agendamentos, contatos e `fila_lote_atual`). Dados do teste
apagados depois por SQL com os ids exatos.
**Falta:** conferir "resultado que libera o cliente" ainda o tirar da lista
(não testado) e o retorno dos cobradores no uso real. Detalhe pequeno
visto: `fila_lote_atual` é chamado 2x após cada registro (efeito de
`versaoRegistros` e de `attemptsByCollection`) — inofensivo.


### Item 49 — Resumo por Cobrador: atendimentos não apareciam — 2026-11-11

A tela só lia `scheduled_visits`; o que o cobrador de carteira registra no
Atender/Fila vai para `collection_attempts` (uma linha por título) e só
virava "Realizada" se havia agendamento aberto — raro desde a Fila (item
40). Novembro: Jonathan 75 atendimentos × 11 "Realizadas", Monalisa 53 × 0.
Agora a tela busca `collection_attempts` do período (+ `BANCO_DADOS` para
título → documento) e mostra **Atendimentos** na Visão geral, nos cards e
na tabela (coluna ordenável, grupo "Registrados"). Unidade decidida com o
usuário: **por cliente, nunca por título** — um atendimento = cliente ×
dia; embaixo, clientes distintos e efetivos (`isEffectiveAttemptResult`).
"Sem agendamento" mantido para todos os perfis (o gestor quer ver quem
ainda não tem próximo contato marcado). Só tela, sem migration.
Conferido na tela (dev, Mês atual): José 27 / Monalisa 53 / Jonathan 75 /
Terceirizado teste 2 = 157, igual à consulta direta no banco.

**Mesmo dia, segunda rodada (usuário: "precisa ser mais simples para o
gestor entender"):**
- Unidade final: **clientes atendidos** no período (cada cliente conta 1
  vez, nem por título nem por dia) + "conversaram" (cliente com algum
  contato efetivo). "Cliente × dia" saiu: "19 clientes · 22 efetivos"
  confundia (efetivos eram por atendimento).
- Visão geral, cards por cobrador e tabela reorganizados nas mesmas 4
  perguntas: **Carteira** (vencido + a vencer, somam o total),
  **Recebido no período** (+ ainda vence no período), **Clientes
  atendidos** (+ conversaram), **Agenda** (atrasados em destaque; agendados,
  feitos, remarcados, não encontrado, sem agendamento, remarcados 3x+ em
  linhas). Tabela de 15 → 10 colunas. Saíram "A receber" (solto), R$ dos
  agendamentos e o bloco "Carteira automática por faixa de atraso"
  (pedido do usuário: inútil nesta tela). Ordenação padrão: maior carteira.
- "Tudo" vai até 9999-12-31 (era 2099): o Ciclone tem vencimento digitado
  com ano 2245, que ficava em "a vencer" mas fora de "vence no período".
  Conferido direto no ERP: a data está errada lá (correção é no Ciclone,
  o sync traz).


### Item 48 — Gestor: números errados após login e travamento entre abas — 2026-11-11

**Números errados após login (`831d182`).** Sair e entrar de novo na mesma
aba (sem F5) mostrava só os clientes quitados: total menor, todos "Sem
Cobrador", valor em aberto R$ 0. O provider não desmonta no logout e o
ramo "usuário não logado" do `CollectionContext` só zerava a trava dos
quitados; `collectionsRequestedRef`/escopo `all` sobreviviam, então
`requestCollections`/`ensureAllCollections` achavam a carteira carregada.
Agora o logout zera todas as travas de carga.
Caso raro (`87439e5`): carga em voo que atravessa logout + login. Cada
login abre uma "sessão" (`sessaoRef`, muda quando muda o `user.id`); a
carga guarda a sessão em que começou e, se mudou, não publica, não grava
cache, não mexe no escopo nem em `error`/`loading`. A carga lê o usuário
atual (`currentUserRef`), não o da closure — uma recarga enfileirada na
sessão anterior serve ao usuário novo. Logout também libera as travas de
carga em andamento e cancela a recarga do realtime (8 s) e o timeout de
60 s do boot. Testado no build de produção: sair no meio da carga da aba
Clientes e entrar de novo sem F5 → mesmos números do F5 (16.809 clientes,
R$ 5.964.970,10). Outras cargas do boot (pagamentos, visitas, usuários)
não têm essa guarda — mesma corrida, efeito menor.

**Travamento ao trocar de aba (gestor).** Medido com `PerformanceObserver`
(long tasks), dados já carregados, ~150 mil títulos. Em dev o `StrictMode`
dobra cada cálculo — os números finais são do build de produção
(`vite preview`):

| Aba | Antes | Depois |
|---|---|---|
| Desempenho | ~32 s (dev) | 0,4–0,5 s |
| Lojas | 1,5 s | 0,5–0,6 s |
| Cobranças | 1,3 s | 0,6–0,7 s |

- `96fb4f8` Desempenho: cada um dos 15 cobradores varria a carteira
  inteira (2 datas parseadas por título), pagamentos, visitas e clientes →
  uma passada por fonte agrupada por cobrador.
- `c563f22` Lojas: 2 filtros iguais da carteira por loja → agrupamento
  único. `FilterBar` reenviava 300 ms após montar um objeto de filtros novo
  com os mesmos valores (debounce da busca) → toda tela com a barra
  recalculava tudo 2x; agora só avisa quando a busca muda.
- `63aaef6` Desempenho: datas do período convertidas uma vez (cache por
  data crua) e compartilhadas entre o ranking e a busca do dono histórico.

Conferência: texto da aba comparado caractere a caractere antes/depois
(Lojas e Desempenho idênticos; numa rodada a única diferença foram 2
agendamentos criados no meio do teste, confirmados no banco). Busca da
FilterBar testada (filtra e limpa).
**Falta:** push e teste do usuário no site. Restante: Cobranças 0,6 s e
Clientes 0,4 s não investigados. Reteste completo 2026-11-11 (build de
produção, todas as abas 2x): maior trava 0,63 s (Lojas).
### Item 46 — "Já pagou" e "venda cancelada" no Atender — 2026-11-10

Reclamação dos cobradores: o cliente diz que já pagou (ou que a venda foi
cancelada) e não há opção no Resultado do Contato para registrar o
atendimento.

**"Cliente diz que já pagou"** (só tela): pergunta se o comprovante chegou.
*Sim* → salva o atendimento (resultado `claims_paid`, efetivo) e abre o
registro do pagamento (ficha → Distribuir Pagamento com
`contatoJaRegistrado`, sem gravar um 2º contato; ou a parcela do acordo).
*Ainda não* → retorno sugerido para amanhã. O fluxo real (decisão do
usuário): o cliente manda o comprovante e o cobrador registra o pagamento.

**"Cliente informa venda cancelada"** (migration `20261110000008`, decisão:
conferência, não cancelamento direto — a venda é do Ciclone e o ERP vence no
sync): o cobrador marca a(s) venda(s) e descreve. `informar_venda_cancelada`
registra o atendimento (`sale_cancel_reported`) nas parcelas da venda, grava
`vendas_conferencia` (fato) e tira as parcelas em aberto da carteira com
situação "Aguardando conferência" (outras vendas ficam). Gestor: painel
"Vendas aguardando conferência" na Cobranças → `decidir_venda_cancelada`
(confirmar = `cancelar_vendas` com registro em `vendas_canceladas`;
devolver = parcelas voltam a quem tinha a carteira). Venda em acordo ativo
é recusada (cancelar o acordo antes).
`0008` aplicada 2026-11-10 (`check:db` OK; tabela só SELECT para
`authenticated`, funções fechadas para `anon`). **Falta:** teste na tela.

### Item 45 — Acordo cancelado e histórico — 2026-11-10

Caso real (cobrador José): acordo de 2 parcelas criado, entrada de R$ 500
registrada e acordo cancelado 43 s depois ("Erro no lançamento"). Pela
imputação proporcional, R$ 476,49 abateram o título e R$ 23,51 ficaram como
juros de um acordo que deixou de valer. O cancelamento não deixava rastro no
histórico da ficha.

**Decisões do usuário:** ao cancelar, os juros já pagos abatem a dívida
original (qualquer motivo de cancelamento; quebra continua com a regra do
financeiro); o Histórico mostra criado/cancelado/quebrado/cumprido e
agendamento cancelado; o cliente do caso real é ajustado.

**Banco** (`20261110000005`, sem `db push`): `acordos.encargos_reimputados`;
origem `acordo_cancelado` em `recebimentos_historico`;
`reimputar_encargos_acordo_cancelado` (interna, idempotente, abate nos
títulos do acordo do mais antigo para o mais novo, nunca além do saldo);
`cancelar_acordo` (corpo de produção) chama no fim; ajuste dos já cancelados
na própria migration (em 2026-11-10 só o da OTICA FERNANDA, R$ 23,51).
Pagamento original não é alterado (registro novo).

**App:** `HistoricoAcordosAgendamentos` no Histórico da ficha; rótulos de
origem `acordo` (antes aparecia "Origem desconhecida (acordo)") e
`acordo_cancelado` no `ClientHistoryViewer`.

**Atenção:** o título é do Ciclone e o sync das 5h faz o ERP vencer — se a
baixa dos R$ 500 não for lançada no Ciclone, o abatimento some do app no
dia seguinte (o registro do pagamento fica no acordo). Avisar o financeiro.
`0005` aplicada 2026-11-10 (`check:db` OK): título da OTICA FERNANDA com
recebido 500,00 (falta 857,56), `encargos_reimputados` 23,51, histórico com
a linha `acordo_cancelado` (476,49 → 500,00); função interna sem EXECUTE
para `anon`/`authenticated`.
**Falta:** teste na tela e push.

**Revisão no mesmo dia (migration `20261110000006`):** o usuário apontou que,
cancelado por erro de lançamento, o acordo é refeito e a entrada é digitada
de novo — manter o pagamento no acordo cancelado contaria o dinheiro duas
vezes. Decisão: **quem cancela escolhe** (obrigatório quando há pagamento):
*Estornar* (será refeito / não aconteceu → estorno ligado a cada pagamento
em `acordo_pagamentos.estorno_de`, títulos voltam ao saldo, inclusive a
reimputação da 0005) ou *Manter como recebido* (cliente pagou e desistiu →
regra da 0005). `acordos.destino_pagamentos` guarda a escolha;
`cancelar_acordo(id, motivo, destino)` (DROP + CREATE pela assinatura);
funções internas `estornar_pagamentos_acordo_cancelado` e
`estornar_valor_no_titulo`. A migration estorna a entrada da OTICA FERNANDA
(pedido do usuário; o título volta a R$ 1.357,56 em aberto). Tela: escolha
no cancelamento do `AcordoDetailModal`; histórico mostra o destino.
`0006` aplicada e conferida 2026-11-10 (`check:db` OK): título da OTICA
FERNANDA de volta a R$ 1.357,56 em aberto (em_atraso), estorno −500
(−476,49/−23,51) ligado à entrada, `destino_pagamentos = estornar`; funções
internas sem EXECUTE para `authenticated`. Falta teste na tela.

**Imputação revista (migration `20261110000007`):** o usuário: "a entrada
não pega juros e multa". Regra nova: a **entrada** (parcela 1) abate 100% do
valor original; as **demais** dividem o original restante e os encargos na
proporção (substitui o "abate nos dois" de 2026-11-05 só para a entrada).
`registrar_pagamento_acordo` (corpo de produção) muda só o cálculo de
`valor_principal`. Termo: Cláusula Segunda reescrita (entrada integral ao
original + percentual das demais). Acordo ativo da OTICA FERNANDA corrigido
na migration: estorno da entrada como foi imputada (476,49/23,51) + novo
lançamento de 500 todo em original (título 476,49 → 500,00).
`0007` aplicada e conferida 2026-11-10 (`check:db` OK): título com 500,00
recebidos (falta 857,56), parcela 1 com líquido 500 (500 − 500 + 500, o
estorno ligado ao lançamento original). Falta teste na tela (Termo novo).

### Item 44 — Carregamento confiável — 2026-11-10

Relato: às vezes a página abre com valores incompletos e só acerta depois de
2–3 F5. Não é limite do Supabase (o teto de ~1000 linhas por resposta já é
paginado); são falhas passageiras tratadas como sucesso + caches velhas.

**Causas encontradas:**
1. Estatísticas do painel e desempenho por cobrador guardadas no
   `statsCache` (**sessionStorage, 2 min, sobrevive ao F5**); a invalidação
   apagava `dashboard-stats` no cache errado e o prefixo `performance` (a
   chave era `collector-performance`) — nunca limpava. Grupos por cliente
   no `dataCache` (10 min) sem ligação com a carga que os gerou.
2. Boot publicava lotes parciais de títulos a cada 2,5 s; se uma faixa
   falhava, a tela ficava com a carteira pela metade.
3. `fetchAllRows` engolia erro de página e devolvia o que tinha como se
   fosse tudo; `sale_payments` em erro virava lista vazia ("Recuperação do
   mês R$ 0"); limites de id com erro viravam "escopo vazio".
4. `fetchCollections` chamado durante outra carga voltava "pronto" na hora
   (com os dados velhos) — `requestCollections`/`ensureAllCollections`
   seguiam com a tela incompleta.
5. Nenhuma requisição tentava de novo em 502/503/504, timeout ou queda de
   rede. Usuários vinham do `localStorage` (30 min) mesmo após F5.

**Correções:** `utils/supabaseRetry.ts` (`comRetentativa`: até 3 novas
tentativas com espera crescente só para erro passageiro; resposta 5xx sem
corpo conta como erro) em todos os helpers de paginação, `fetchAllRows`,
usuários, visitas, pagamentos, limites de faixa e contatos da carteira.
`fetchAllRows` lança em falha definitiva (4 telas mostram aviso).
Títulos: só o conjunto completo vai para a tela; em erro fica o anterior +
mensagem. `fetchCollections` vira fila de promessas (quem pede durante uma
carga espera a próxima). Derivações com memo dentro do `useMemo` (morre
quando os dados mudam). Boot busca usuários sem cache. Fila: lote só com a
carteira inteira e os contatos da carga atual (erro → aviso, sem lote).
**Falta:** teste no navegador (abrir/F5 como gestor e cobrador, Cobranças,
Desempenho, Fila) e push.

### Item 43 — Ficha do cliente única — 2026-11-10

Achado no teste do item 41: a Cobranças do gestor (lista por venda do
`CollectionTable`) não abria o detalhe do cliente — clicar no cliente
expandia as vendas e "Ver detalhes da venda" abria o `SaleDetailsModal`.
Existiam 3 janelas para ver um cliente (detalhe do cliente, detalhe da venda,
título/`CollectionModal`). Pedido do usuário: unificar. Plano aprovado:
uma "Ficha do cliente" (`ClientDetailModal`) como porta única, em etapas.

**Etapa 1 (feita):** na Cobranças, clicar no cliente abre a Ficha; a seta
"Ver vendas aqui" mostra/esconde as vendas na lista; "Ver detalhes da venda"
abre a Ficha na aba Todos com a venda expandida e rolada até ela (prop
`vendaInicial`; sem o cliente carregado cai na janela antiga). Visto no
navegador local como gestor (só abrindo, sem gravar).
**Etapa 2 (feita):** `SaleDetailsModal` removido. "Detalhes" da venda, o
`openSaleDetails` da tabela (usado pelo ManagerDashboard) e as notificações
de venda abrem a Ficha na venda. Parcelas, endereço (com atualizar),
visitas e pagamentos já estavam na Ficha; faltava a observação do
pagamento — agora no Histórico (`ClientHistoryViewer`). Visto no navegador.
**Etapa 3 (feita):** `CollectionModal` era código morto (o estado que o abria
nunca virava true); removido com `addAttempt` (único insert em
`collection_attempts` fora da RPC além do pagamento parcial com contato
agendado do `GeneralPaymentModal`, que é proposital e ficou).
**Etapa 4 (feita):** a Ficha mostra Atender / Fazer acordo / Ver acordo
também para cobrador de carteira (sempre no próprio nome, sem a escolha
do gestor). A linha da Fila/Carteira continua com os mesmos botões.
Resultado: uma janela para ver o cliente; os modais de ação (Atender,
Acordo, Detalhe do acordo, Distribuir pagamento) já eram únicos.
Observação: a Ficha mostra as vendas que o gestor consultou na Cobranças
(filtro "Em atraso" etc.) — conferir no teste do acordo se faltam títulos.

### Item 41 — Gestor atende e faz acordo pelo cobrador — 2026-11-10

Pedido: o gestor precisa fazer os acordos e atendimentos que o cobrador faz.
Levantamento: o gestor já tinha no detalhe do cliente Ver Dados/Vendas/
Histórico/Distribuir/Editar Pagamentos; faltavam Atender e Acordo (só na
tela do cobrador). No banco, `criar_acordo`/pagamento/cancelamento de
acordo já aceitavam o gestor, mas gravavam tudo em nome de quem registrou.

**Decisões do usuário:** em cada registro o gestor/diretor escolhe se fica
no nome dele ou no do cobrador ("um pouco dos dois"); o próximo contato
agendado segue a mesma escolha; registro do gestor conta como "registrado"
no lote da Fila do cobrador. O usuário sugeriu reaproveitar a tela
Cobranças: o detalhe do cliente que ela abre recebeu os botões (o
`CollectionModal` antigo não foi reaproveitado — ver item 42).

**Banco** (`20261110000004`, corpos de produção): `registrar_contato` e
`criar_acordo` ganham `p_em_nome_de uuid` (fim, default NULL; DROP + CREATE
pela assinatura, GRANT explícito). Só o gestor usa, e só para o cobrador
cuja carteira tem o cliente (acordo: só perfil de carteira). Autor fica em
`collection_attempts.registrado_por_id` (coluna nova),
`scheduled_visits.scheduled_by_manager_id` e `acordos.created_by_id`.
`fila_item_finalizado`: contato/pagamento de qualquer um e acordo criado
contam.

**App:** no detalhe do cliente (gestor, com saldo ou acordo): "Registrar em
nome de: [cobrador da carteira | Eu]" + Atender / Fazer acordo / Ver acordo,
abrindo `LogContactModal`/`AcordoModal`/`AcordoDetailModal` (props
`emNomeDe`). Títulos em aberto com mais de um cobrador: só "Eu". Acordo em
nome de cobrador de visita cai no nome do gestor (avisado na tela).

**Limitações conhecidas:** gestor "Eu" com próximo contato agendado — não
há lista de retornos do gestor (o agendamento existe e trava agendamento de
outro no mesmo cliente). Pagamento de parcela de acordo pelo gestor
continua em nome do gestor (não foi perguntado).
`0004` aplicada 2026-11-10 (`check:db` OK): versões antigas de
`registrar_contato`/`criar_acordo` (11 args) removidas, novas só para
`authenticated`; o `criar_acordo(text,jsonb,jsonb)` legado continua igual.
**Falta:** teste na tela, push.

### Item 40 — Fila de Cobrança em lotes (substitui a Agenda) — 2026-11-10

Orientação do gestor: a Agenda deixa de existir; o cobrador de carteira tem
**Fila de Cobrança** (trabalho do dia, controlado) e **Carteira completa**
(consulta de todos). A fila mostra só os clientes definidos na Distribuição,
nas quantidades/faixas/ordem do gestor, em lotes: ex. José 5 (1–60) + 2
(61–90) + 2 (91–365) + 1 (366–1460) = 10; os próximos 10 só depois de
finalizar os 10. Substitui a decisão do item 39 "fila = lista do dia".

**Decisões (2026-11-10, todas as recomendadas):**
- Finalizado = qualquer registro depois que o lote abriu: "Atender"
  (inclusive não atendeu), "Deixar para depois", pagamento; ou o cliente
  saiu da carteira / quitou. Nunca trava.
- Urgências: compromisso com data (contato agendado, promessa vencendo) fica
  acima do lote, fora da contagem; alerta (acordo quebrado, vai sair da
  carteira) entra no lote primeiro dentro da faixa dele.
- Lote não terminado continua no dia seguinte.
- Carteira completa ganha os filtros da Agenda: Para hoje | Sem contato |
  Contatados hoje | Contatados 1–7 dias, e faixa de atraso.
- Padrões assumidos: tamanho = soma das quantidades do turno em que o lote
  abriu; faixa sem clientes suficientes cede vagas às outras na proporção;
  sem fila configurada, lote de 10 por maior atraso; candidato = dívida
  vencida, sem compromisso marcado, sem contato efetivo em 7 dias, não
  tentado nem deixado para depois hoje; faixa com 0 ou fora do valor não
  entra (só "exclusivamente os clientes definidos pelo gestor").

**Banco** (`20261110000003`, sem `db push`): `fila_lotes` (um aberto por
cobrador, índice único parcial) e `fila_lote_itens` (posição, regra, alerta)
— fato histórico, só SELECT para `authenticated` (dono ou gestor), escrita só
por função. `fila_item_finalizado` (regra única do "finalizado"),
`fila_lote_atual()` (INVOKER) e `abrir_lote_fila(itens, turno, tamanho)`
(DEFINER, só cobrador, lock por cobrador; com pendente devolve o lote aberto
em vez de criar; valida carteira/saldo/regra).

**App:** `montarLoteFila`/`tamanhoDoLote` em `filters/filaCobranca.ts`
(substituem `montarFilaLigar`; cenário fictício conferido), hook
`useFilaLote`, `CollectorDashboard` (abas "Fila de Cobrança" | "Carteira
completa"; lote abre sozinho quando não há lote ou o atual acabou; relê após
Atender/acordo/detalhe/cancelar contato; busca leva para a Carteira).
Distribuição: textos da fila falam em lote.

`0003` aplicada 2026-11-10 (`check:db` OK; tabelas só SELECT para
`authenticated`, nada para `anon`). Primeiro lote real: José, turno tarde,
10 clientes = 5 (1–60) + 2 (61–90) + 2 (91–365) + 1 (366–1460, com alerta),
conforme a Distribuição.
**Falta:** teste completo na tela (registrar os 10 e ver o próximo lote
abrir), push. Etapa 3 (supervisão) pode usar
`fila_lote_itens` (previstos × registrados por faixa).

### Senha de login — 2026-11-10

Sem tela de troca de senha: modelo SQL em `scripts/sql/trocar-senha-usuario.sql`
(conferência + UPDATE em `auth.users`, rodar no SQL Editor; não commitar com
senha preenchida).

**Criar usuário já com login** (mesmo dia): a tela Usuários (gestor) pede
senha + confirmação no "Novo Usuário" e chama a RPC
`criar_usuario_com_login` (migration `20261110000001`, `SECURITY DEFINER`,
guard `IS DISTINCT FROM 'manager'`). Numa transação: `auth.users` (bcrypt,
e-mail confirmado, formato copiado da conta de `jose_focco`) +
`auth.identities` + `public.users` com `auth_user_id`/`auth_email`. E-mail
sintético = slug do login `@collectors.internal` (sufixo `-2`… se colidir).
Login duplicado é recusado sem diferenciar maiúscula. O provisionamento
manual no SQL Editor deixa de ser necessário para usuário novo.
**Redefinir senha** (mesmo dia): botão de chave na linha do usuário abre
modal (senha + confirmação) → RPC `redefinir_senha_usuario` (migration
`20261110000002`, só gestor, troca só o hash em `auth.users`; erro se o
usuário não tiver conta de login). O modelo SQL fica só como reserva.
Migrations `0001`/`0002` aplicadas e conferidas em produção 2026-11-10
(gestor-only, sem `anon`, `check:db` OK).
**Falta:** teste na tela (criar e entrar com o login novo; redefinir e
entrar com a senha nova) e push do front.

### Item 38 — Carteira: filtro "já entrei em contato" — 2026-11-09

Pedido dos cobradores: cliente contatado hoje continuava na agenda igual aos
outros, sem filtro. Na tela do cobrador de carteira: card **"Contatados
hoje"** (clicável, filtra), botões **Contato: Todos · Contatados hoje ·
Últimos 7 dias · Sem contato há 7+ dias** (valem para a Agenda e a Carteira
completa; os KPIs de valor seguem com a carteira inteira) e selo verde
**"✓ Contatado hoje"** na coluna "Última interação". Regra: qualquer
interação registrada (`collection_attempts`, mesma fonte da coluna "Última
interação"). Só front. Falta testar na tela.

**Revisão no mesmo dia (feedback: "fica confuso ter tudo isso").** A Agenda
misturava três perguntas em 12 botões ("o que fazer hoje", "quão atrasado",
"já falei?"). Virou **3 abas pelo que o cobrador faz**: **Para hoje**
(contato agendado ou promessa que chegou; acordo quebrado e "perto de sair
da faixa" só sem contato recente) · **A contatar** (sem contato há 7+ dias;
maior atraso primeiro, em dia no fim) · **Já contatados** (contato nos
últimos 7 dias). Subfiltro da aba separado por "|" (motivo / faixa de atraso
/ hoje × antes). Ao registrar o contato o cliente passa de "A contatar" para
"Já contatados". Saíram a fileira "Contato:" e as abas por faixa,
"Sem contato" e "Em tratamento"; o card "Contatados hoje" abre "Já
contatados › Hoje".

**"Retorno" × "Agendado".** Eram dois fatos com nome confuso: "Retorno" era
a data que o **cliente prometeu pagar** e o selo "Agendado" o contato que o
**cobrador marcou** (o Atender sugere o dia seguinte à promessa). Viraram
uma coluna só, **"Próximo passo"**: "Ligar/WhatsApp em dd/mm às hh:mm"
(vermelho "Atrasado:" se passou) e "Prometeu pagar dd/mm" (vermelho
"Promessa venceu" se passou). O selo saiu da coluna do nome. Com contato
agendado ativo, a promessa vencida não joga o cliente em "Para hoje" — o
agendamento manda.

**Fluxo pela perspectiva do cobrador (mesmo dia).** Simulando o dia dele:
(1) "Não atende"/"Ocupado"/"Telefone errado"/"Mensagem enviada" jogavam o
cliente em "Já contatados" por 7 dias sem ele ter falado com ninguém;
(2) Telefone/WhatsApp só abriam a ligação/conversa — o contato acontecia e
não era registrado; (3) 9 números no topo, vários de acompanhamento do
gestor; (4) jargão ("faixa"); (5) 5 botões iguais na linha. Mudanças:
- **"Já contatados" só com contato efetivo** (mesma regra da meta,
  `isEffectiveAttemptResult`). Tentativa sem sucesso deixa o cliente em
  **"Ligar"** (antes "A contatar"), no fim da lista, com o selo
  **"Tentou hoje: Não atendeu"**; contato efetivo mostra **"Falou hoje"**.
  A promessa vem do último contato efetivo (uma tentativa depois não apaga
  a data prometida).
- **Atender abre sozinho** depois de WhatsApp (quando o cobrador volta para
  a tela) e ao fechar o telefone depois de Ligar/Copiar, já com o canal
  marcado ("Você abriu o WhatsApp deste cliente. Como foi?").
- **Cards de contadores do dia removidos** (o usuário também dispensou um
  card de progresso).
- "Perto de sair da faixa" → **"Vai sair da carteira"**.
- **Atender** virou o botão principal da linha (azul, com texto);
  **"Cancelar este agendamento"** foi para dentro do Atender.

### Publicação 2026-11-09 (tarde) — itens 29 a 37

Commits `25de5dd`…`6d48d2e` publicados na `master` ao longo do dia, cada um
com `npm run build` OK antes do push. Migrations `20261109000001`…`0009`
todas aplicadas em produção (`db push` pelo usuário) com `npm run check:db`
OK depois de cada uma. A 0009 cancelou os 20 agendamentos presos (0 órfãos
restantes conferido no banco).

| Item | O que | Commit |
|---|---|---|
| 29 | Código do cliente do Ciclone | `25de5dd` |
| 30 | Pagamento: venda do Ciclone em bigint (400 no Distribuir) | `a63fa1d` |
| 31 | Detalhes do Cliente: abas Todos / Em aberto / Pagos | `105c621` |
| 32 | WhatsApp: valor só em atraso, aba única no computador | `af82e92` |
| 33 | Distribuição: retirar de outra carteira só marcando; inativo libera | `86332b9` |
| 34 | Carteira: vencido × a vencer; aviso de loja desatualizada | `7bce278` |
| — | Selo "Agendado: ligação em dd/mm às hh:mm" | `3cc012a` |
| 35 | Detalhes do Cliente mais rápido; "Histórico" para todos; RLS do histórico | `a335caf` |
| 36 | Distribuir Pagamento: juros, ordem por vencimento, interação automática; só externo reagenda; modo noturno | `ef14834`, `6d48d2e`, `1047006` |
| 37 | Agendamento segue o cliente ao sair da carteira | `44a69ce` |

**Falta testar no site** (nada destes foi testado na tela ainda):
- Item 34: coluna "Em atraso" com "+ a vencer", selo "Em dia", aviso de
  loja desatualizada na Distribuição (hoje só uma loja externa está velha).
- Item 35: modal mais leve; aba "Histórico" do cobrador sem nomes de outros
  cobradores; gestor vê a linha do tempo da carteira.
- Item 36: pergunta juros × adiantamento; interno pagando a menos não pede
  agendamento e grava "Pagamento parcial" com resumo; externo reagenda a
  visita (sem data/hora no passado); modo noturno do modal.
- Item 37: ao remover/redistribuir um cliente com agendamento, ele é
  cancelado (ou vai junto para cobrador de perfil compatível).

**Pendências que continuam abertas:** conciliação pagamento no app × baixa no
Ciclone (o sync sobrescreve o recebido todo dia; 59 de 104 mudanças do app
baixadas depois — levar para a reunião); pagamento real da loja com venda
grande (item 30) a repetir; tela do externo ainda mostra saldo total (item
34); memoizar o `value` do `CollectionContext` se o modal ainda engasgar.

### Item 37 — Agendamento segue o cliente quando ele sai da carteira — 2026-11-09

**Achado.** Nenhum caminho que tira o cliente da carteira (inativar cobrador,
distribuição, remover cobrador, liberar) mexia no agendamento ativo; só a
quitação total cancelava. O agendamento ficava com quem não tem mais o
cliente (a RLS esconde dele), aparecia atrasado no Acompanhamento e, pelo
índice de um agendamento ativo por cliente, **bloqueava o novo cobrador de
agendar**. Em produção: 20 visitas presenciais presas (16 de cobrador
inativado, de abril/2026; 4 de clientes removidos de um externo). Os
agendamentos de contato da carteira estavam todos com o dono certo.
Observação: `atribuir_clientes_em_lote` recusa cliente com agendamento ativo,
então a transferência "leva o agendamento junto" quase nunca acontece.

**Regra nova** (migration `20261109000009_agendamento_segue_carteira`,
gatilho por comando em `BANCO_DADOS` quando `user_id` muda): agendamento
ativo cujo cobrador não tem mais parcela do cliente passa para o novo
cobrador se o canal for do perfil dele (presencial = Externo; ligação/
WhatsApp = carteira); senão é **cancelado** ("cliente saiu da carteira do
cobrador", `cancellation_approved_by = 'sistema (saiu da carteira)'`). A
mesma migration cancela os 20 presos. Testado em transação descartada:
remover cobrador → cancela; passar para outro interno → agendamento vai junto;
a migration inteira cancela exatamente 20.

**Modo noturno** no "Distribuir Pagamento" (classes `dark:` no padrão do
AcordoModal/Atender).

### Item 36 — "Distribuir Pagamento": juros, vencido × a vencer e acompanhamento por perfil — 2026-11-09

**Caso real.** Cobrador interno recebeu a parcela vencida com juros. O
excedente (juros) abateu a parcela seguinte, a vencer; o modal tratou como
"pagamento parcial" porque o saldo TOTAL (com parcelas a vencer) não zerou e
pediu reagendamento; o reagendamento virou **visita presencial** (invisível na
agenda do cobrador de carteira, que só lê ligação/WhatsApp, e bloqueando novos
agendamentos do cliente pelo índice de um ativo por cliente); nenhuma
interação foi gravada. Limpeza feita com autorização: visita cancelada (status,
sem apagar) e interação registrada.

**Como juros funcionava.** App e `process_payment` não têm juros: tudo que
passa da parcela abate a próxima. O Ciclone registra juros/multa à parte na
baixa (`fntbd_valorjuro`/`fntbd_valormulta`) e o sync traz só o principal
(valor − saldo) e **sobrescreve o recebido de todas as parcelas a cada
execução**. Medido: das 104 mudanças de parcela feitas por pagamento no app,
74 foram alteradas depois pelo sync, 59 para menos — parte é baixa ainda não
lançada no Ciclone (tema da conciliação app × Ciclone, pendente da reunião).

**Mudanças:**
- Migration `20261109000008_pagamento_juros_separado`:
  `sale_payments.juros_amount` (≥ 0) e `process_payment(..., p_juros_amount)`
  (DROP + CREATE, corpo de produção). `payment_amount` continua sendo o
  principal aplicado nas parcelas.
- Modal: quando o valor passa do vencido, pergunta se o excedente é **juros/
  multa** (não abate parcela) ou **adiantamento**. Distribuição parcela a
  parcela, vencimento mais antigo primeiro (antes: venda de menor saldo
  primeiro). Com acordo ativo segue a regra antiga, sem a pergunta.
- Reagendar só se **sobrar vencido**, e **só para o cobrador externo**
  (visita presencial). Decisão do usuário (2026-11-09): o cobrador de
  carteira **não agenda** no "Distribuir Pagamento" — só grava a interação
  ("Pagamento integral/parcial", com resumo automático). Se ficou sem
  vencido, a interação conclui o contato agendado (RPC `registrar_contato`);
  se foi parcial, o contato agendado fica como está. Gestor: só o pagamento.
- Data/horário no passado bloqueados; sem `alert()` nessa janela.
- Pagamento e acompanhamento em passos separados: se o segundo falhar, o
  pagamento vale e o aviso diz o que faltou.
- Histórico de Contatos (Detalhes do Cliente) agrupa as linhas gravadas
  juntas: um contato de carteira grava uma linha por título em aberto e a
  tela mostrava o mesmo contato repetido (4× num cliente com 4 títulos).
- Limpeza do caso: a interação ficou duplicada (o cobrador registrou pelo
  "Atender" minutos antes da limpeza); por decisão do usuário ficou a da
  limpeza e as 4 linhas do cobrador foram apagadas (cópia guardada antes).

### Item 35 — Detalhes do Cliente: velocidade e aba "Histórico" para todos — 2026-11-09

**Travamento.** O saldo de cada venda (`calculateSaleBalance`) varria a lista
inteira de títulos carregada a cada chamada, e o modal chamava isso 3× por
venda ao abrir e 1× por venda visível a cada clique; as funções do contexto
eram recriadas a cada atualização, então os `useMemo` do modal nunca
aproveitavam. Corrigido sem mudar regra: índice "títulos por cliente"
(`rawCollectionsByDocument`/`collectionsByDocument`) no `CollectionContext`,
`calculateSaleBalance`/`getSalePayments` com `useCallback`, e no modal o
saldo de cada venda é calculado uma vez (`saldoPorVenda`). A consulta de
token a cada 3 s só roda com pedido pendente. Fica para depois (se ainda
engasgar com atualização em tempo real): memoizar o `value` do contexto.

**Histórico.** Antes: "Histórico" (carteira + baixas) só para o gestor, e o
Histórico de Contatos/visitas/reagendamentos escondido dentro de "Ver Dados".
Agora "Ver Dados" é só cadastro + Ciclone; "Histórico" existe para todos com
contatos, visitas realizadas, reincidência e baixas. Só o gestor vê a linha do
tempo da carteira e os nomes (quem registrou, carteira de quem). No banco,
`atribuicoes_historico` e `recebimentos_historico` deixam de ser legíveis por
qualquer logado (migration `20261109000007_historico_leitura_por_perfil`):
gestor vê tudo; cobrador vê a atribuição em que está envolvido e as baixas de
parcelas da carteira dele. Antes de aplicar, conferido que só telas de gestor
leem essas tabelas e que os gatilhos que gravam são `SECURITY DEFINER`.
Aplicada em 2026-11-09, `check:db` OK. Simulado no banco (transação
descartada): cobrador interno com 1.122 clientes leu 2.860 atribuições (0 de
outros) e 6.355 baixas de 1.057 clientes; gestor leu tudo (16.797 / 140.958).
Falta teste na tela.

### Item 34 — Carteira: mostrar o que precisa ser cobrado — análise 2026-11-09

Dúvida do usuário: cliente com ~R$ 450 só em parcelas a vencer na carteira
de um cobrador interno — deveria estar lá? Análise (sem mudar código):
- **Seleção correta com os dados do momento**: a parcela vencida em 30/10
  foi paga em 04/11 na loja, mas o pagamento só entrou no sistema em 09/11
  (importação). Em 06/11 a distribuição via 7 dias de atraso → faixa 3–60.
  Hoje atraso 0; continua com o cobrador pela regra "abaixo da 1ª faixa fica
  com ele" (item 25, sem vai-e-vem).
- **Exibição inconsistente**: a carteira lista todo cliente com saldo e
  mostra `pendingValue` (vencido + a vencer) na linha, "Valor Pendente" e
  "Volume em Aberto". Medido: 329 clientes em carteiras sem nada vencido; %
  a vencer do volume exibido vai de 0% (Jurídica) a 82% (Vanessa); Monalisa
  22%, Jonathan 20%, José 26%. E a mensagem do WhatsApp (item 32) já usa só
  o vencido — dois números diferentes para o mesmo cliente.
- **Contradição na regra**: "carteira só com atrasados" × "abaixo da 1ª faixa
  fica com o cobrador": tirar o cliente quando o atraso zera traz o
  vai-e-vem de volta (sai hoje, volta 3 dias após a próxima parcela, talvez
  para outro cobrador pela carga). E "a cobrar" (vencido) ≠ "negociável"
  (total, o acordo inclui parcelas a vencer).

**Recomendações aceitas pelo usuário** ("a lógica interna não estava
errada, só a forma como estávamos vendo"):
1. Valor principal da carteira = só o vencido (`clientOverdueAmount`, regra
   única) na linha, ordenação, volume e meta; "+ R$ X a vencer" secundário;
   total completo só no Detalhes do Cliente.
2. Cliente sem nada vencido continua com o cobrador, mas numa seção/aba
   "Em dia (aguardando vencimento)", fora da fila, das contagens e do volume.
3. Distribuir só com dados atualizados: sync/importação antes de simular;
   avaliar aviso de importação antiga por loja.

**Decisão do gerente (mesmo dia):** "não é para sair da carteira, só deixar
claro quando a dívida é vencida ou a vencer". A aba "Em dia" que tirava
esses clientes da fila foi desfeita antes do commit; a regra "abaixo da 1ª
faixa fica com o cobrador" (item 25) continua.

**Implementado (2026-11-09):**
- `clientBalanceSplit` (`filters/clientStatus`, regra única, ciente de
  acordo ativo): saldo do cliente em `vencido` × `aVencer`;
  `clientOverdueAmount` passa a usá-la.
- Carteira do cobrador de carteira (`CollectorDashboard`,
  `InternalCollectorWallet`): coluna "Em atraso" (era "Valor Pendente")
  mostra só o vencido, com "+ R$ X a vencer" abaixo; selo verde "Em dia — só
  parcelas a vencer" quando nada venceu; ordenação por valor usa o vencido;
  card "Volume em Atraso" (era "Volume em Aberto") só com o vencido + linha
  "+ R$ X a vencer (ainda no prazo)"; "Total de Clientes" mostra quantos estão
  em dia; ticket médio sobre o vencido. Todos os clientes continuam na Agenda
  e na Carteira completa. WhatsApp usa o mesmo `vencido`.
- Migration `20261109000006_lojas_ultima_baixa_externa` (só leitura, só
  gestor): por loja, quando a última baixa vinda de fora do app
  (`recebimentos_historico.origem <> 'app'`) entrou no sistema — não há log
  de importação. Tela Distribuição, passo 3: aviso âmbar com as lojas com
  cliente em aberto sem baixa nova há mais de 2 dias (ou nunca). Sem a
  migration, o aviso só não aparece. Em 09/11: Itapipoca Ext sem baixa
  desde 06/10.
- Fora do escopo: a tela do cobrador externo (rota/visitas) segue com o
  saldo total.
- **Selo do contato agendado (mesmo dia):** dúvida do usuário sobre a data
  "Ligação: 10/11 10:00:00" num card com último contato em 09/11 — conferido
  no banco: não era erro nem fuso (era o retorno agendado para o dia
  seguinte; `scheduled_date` é data pura). Selo passou a dizer "Agendado:
  ligação em dd/mm/aaaa às hh:mm" ("Agendamento atrasado" quando passou).
  Horário sem segundos via `formatHorario` (`utils/formatters`) no card,
  Detalhes do Cliente, Detalhes da Venda, Acompanhamento de Visitas e
  Atender.
- **Limpeza de teste (09/11, pedido do usuário):** removido um registro de
  contato de teste (8 linhas de `collection_attempts`, uma por parcela) de
  um cliente usado em teste; histórico de atribuições e parcelas mantidos.

### Item 33 — Distribuição: regras mestre — 2026-11-09

Usuário: "Jonathan tem 73 clientes, acho que deveria ter mais". Medido: as 4
faixas dele (todas ativas desde depois de 06/11; 3–60 e 61–90 nas 3 lojas,
91–365 em Eusébio/Messejana, 366–948 em Eusébio) cobrem 723 clientes com
saldo; 73 com ele, **650 com cobradores sem regra** (Samila 469, Carlos 79,
Beatriz 70, Francisco 21, Jurídica 11), nenhum sem cobrador. Não era erro: o
plano (item 25) tratava carteira de cobrador sem regra como manual.

Decisão do usuário: "as regras da Distribuição são mestre; o que estiver lá
é o que deve ser". Casos de borda perguntados, respostas: cliente coberto
vai para o dono da regra **venha de qualquer cobrador** (inclusive externo e
Jurídica); cliente que nenhuma regra cobre, com cobrador sem regra, **sai**
(fica sem cobrador). Migration `20261109000003_distribuicao_regra_mestre`:
`plano_distribuicao_carteira` copiada de produção sem o bloco "cobrador sem
regra: não mexe" (diff = só esse bloco). Travas mantidas (acordo/agendamento
ativo, Falecido, "Aguardando <perfil>"). Texto da tela Distribuição
atualizado. **A migration não move ninguém**: só o "Aplicar" da tela move.
Impacto esperado grande (todo cobrador sem regra perde a carteira ao
aplicar) — simular e mostrar por cobrador antes.

**Inativos (migration `20261109000004`, aplicada 2026-11-09)** — pedido do
usuário: "quando o usuário fica inativo, todos os seus clientes devem ficar
sem cobrador e vazio". Gatilho `trg_users_libera_carteira_ao_inativar`
(`active` → false: `user_id` e `situacao` NULL, motivo `cobrador_inativado`
no histórico, usa a exceção `cobranca.liberacao_autorizada` do
`protege_atribuicao`) + liberação única de quem já estava inativo: 17.105
parcelas / 1.828 clientes (Beatriz 811, Samila 766, Luís 251), conferido no
histórico. Tela Usuários recarrega os clientes ao desativar. Usuário
confirmou: "a lógica dos inativos está correta".

**Mudança de rumo (mesmo dia, antes de qualquer aplicação):** o usuário
reviu a regra mestre ("acho que fiz besteira"; "a base do Francisco não é
para sair"; "esse sistema não deveria retirar da outra carteira — o gestor
deve ter a responsabilidade"). Nenhuma distribuição tinha sido aplicada com
a `0003`. Migration `20261109000005_distribuicao_retirar_com_selecao`:
plano/prévia/aplicar ganham `p_retirar_de uuid[] DEFAULT '{}'` (DROP +
CREATE; prévia e aplicar copiadas de produção trocando só assinatura e a
chamada ao plano). Cobrador **ativo sem regra** = carteira manual: cliente
que nenhuma regra cobre fica; cliente coberto volta como ação `retido` e só
vai para o dono da regra se o gestor marcou aquele cobrador. Cobrador com
regra: como antes da `0003`. Inativo não segura nada. Tela: aviso "Existem
clientes atrelados a outro cobrador nesta distribuição" com checkbox por
cobrador (desmarcados), marcar exige simular de novo, confirmação cita de
quem retira. Front publicado chama sem o parâmetro → nada é retirado.

### Item 32 — WhatsApp: valor em atraso e aba única no computador — 2026-11-09

- A mensagem do card citava `pendingValue` (total em aberto, com parcelas a
  vencer). Agora cita só o vencido: regra nova `clientOverdueAmount`
  (`filters/clientStatus`, mesmo recorte de `clientMaxOverdueDays`, ciente de
  acordo ativo). Sem nada vencido: "suas parcelas em aberto", sem valor.
- Pedido: "WhatsApp Web conectado dentro da plataforma". **Impossível
  embutir**: o web.whatsapp.com bloqueia iframe (X-Frame-Options/CSP). Feito:
  `src/utils/whatsapp.ts` (`abrirWhatsApp`) — no computador vai direto ao
  `web.whatsapp.com/send` numa aba de nome fixo (`whatsapp_cobranca`),
  reaproveitada a cada cliente (sem `noopener`, que faria o navegador ignorar
  o nome; o vínculo é cortado com `opener = null`); no celular segue `wa.me`
  (abre o app). Aplicado nos 4 pontos que montavam `wa.me` (card da carteira,
  acordo, CollectionModal, Atribuição). WhatsApp de verdade dentro do app só
  com a API oficial (WhatsApp Business) — projeto à parte, não avaliado.

### Item 31 — Detalhes do Cliente: abas na lista de vendas — 2026-11-09

Abas **Todos | Em aberto | Pagos** com contagem ("Em aberto" mostra quantas
estão em atraso). Decisão do usuário: "Em aberto" (toda venda com saldo,
mais atrasada primeiro) em vez de só "Em atraso", para venda só com parcela
a vencer não sumir. Venda toda fora da cobrança só em "Todos". Abre em
"Em aberto" quando há dívida.

### Item 30 — Número da venda do Ciclone não cabe em `integer` no pagamento — 2026-11-09

Usuário: "Distribuir Pagamento" deu `400` num cliente real. Causa:
`BANCO_DADOS.numero_titulo` é `bigint` (o Ciclone gera números como
2603244482; o maior é 23121321703), mas o pagamento usava `integer` no
parâmetro `p_sale_number` de `process_payment` e de
`registrar_ajuste_recebimento` ("Editar Pagamentos") e na coluna
`sale_payments.sale_number`. Acima de 2.147.483.647 o PostgREST recusa a
chamada antes de executar — nada é gravado. 4.028 títulos acima do limite;
562 clientes com saldo afetados (o cliente do relato tinha só esse título em
aberto). Não tem relação com as mudanças do dia: o número vem do Ciclone desde
a importação; foi a primeira tentativa de pagar uma dessas vendas pelo app.

Migration `20261109000002_numero_venda_bigint_no_pagamento`: os três viram
`bigint`. Corpos das funções **gerados de produção** (`pg_get_functiondef`)
por script, trocando só o tipo — diff contra produção = só a assinatura.
DROP + CREATE (o tipo do parâmetro é parte da assinatura) com EXECUTE para
`authenticated`/`service_role`, como em produção. A view
`daily_payment_report` depende da coluna e é recriada igual (definição,
comentário e grants de produção). Front não muda (número JS cobre até 2^53).
**Aplicada 2026-11-09** (`db push` do usuário): `check:db` OK; conferido no
banco — só as assinaturas `bigint` existem (nenhuma sobrecarga `integer`
sobrando), ACL/SECURITY DEFINER/search_path iguais aos de antes, coluna
`bigint`, view com os mesmos grants respondendo; 1.133 pagamentos intactos.
Pendência anotada: `GeneralPaymentModal` ainda usa `alert()` nativo em
validações.

### Item 29 — Código do cliente do Ciclone — 2026-11-09 (em andamento)

Pedido: o ERP e o financeiro identificam o cliente pelo código do Ciclone; o
app só tinha CPF/CNPJ (o código da SSÓtica existe, mas não é usado — fora).
Medido no Ciclone (só leitura): 1.890 CPF/CNPJ, 1.889 com um código só e 1
com dois; faixa 100001–102423.
- **Migration `20261109000001_clientes_codigo_cliente_erp`**: coluna
  `clientes.codigo_cliente_erp text`, espelho do ERP (o sync sobrescreve).
  Texto porque o documento com dois códigos guarda os dois ("100123, 100456").
- **Sync** (`sync_financeiro.py`, fora do git; backup antes da edição): lê
  `pgcln_codigo`, junta os códigos por documento (`juntar_codigos_cliente`) e
  grava junto dos outros campos do ERP; sem a migration, segue sem a coluna
  (`CAMPOS_ERP_OPCIONAIS`). Dry-run conferido.
- **Front**: `clientesRegistry` tenta a coluna nova e cai para as anteriores;
  "Cód. <código>" no card do cobrador, na Atribuição (+ coluna "Código
  Ciclone" no Excel), na agenda de contato e na ficha (cabeçalho + "Dados do
  Ciclone"); código entra na busca (carteira, Atribuição, agenda de contato e
  de visitas).
- **Ordem**: `db push` → `check:db` → sync → teste → commit → push do front.
- **2026-11-09**: `db push` feito pelo usuário, `check:db` OK; sync manual às
  10:22 gravou o código nos 1.888 clientes do Ciclone (100002–102423), sem
  código repetido entre clientes e nenhum com dois códigos (o documento com
  dois no ERP só tem títulos em um deles nas empresas sincronizadas).

### Item 28 — Busca por CPF/CNPJ só com os números — 2026-11-09 (`f756638`)

O documento é gravado formatado e a busca comparava o texto cru: era preciso
digitar a máscara. Regra única `documentoCombina` (`src/filters/documento.ts`):
o texto cru continua valendo; termo só com números/pontuação e 3+ dígitos
compara só os dígitos dos dois lados; termo com letras ("otica 2") não entra
na comparação por dígitos. Aplicada nas 8 buscas por documento (filtros da
carteira/Atribuição em `predicates.ts` e `CollectionContext`, agenda de
contato, Acompanhamento de Visitas, Gestão de Lojas e 3 buscas do
`VisitScheduler` — duas delas já tinham regra própria por dígitos, agora
unificadas). Fora: histórico de Autorizações (busca feita no servidor).

### Item 27 — Detalhes do Cliente: parcelas pelo saldo — 2026-11-09 (`15e780a`)

Usuário: "algo de errado na lógica das parcelas, no que condiz a atraso".
O modal decidia "paga" por `status.includes("pago")`. Medido em produção:
18.628 parcelas `recebido` (Ciclone, sem "pago") apareciam com bolinha
vermelha e atraso desde o vencimento; 42 `Pago`/`Pago Parcial` com saldo
apareciam quitadas, sem atraso. Correções em `ClientDetailModal.tsx`:
- situação da parcela por `hasInstallmentBalance` (fora da cobrança → cinza,
  sem atraso);
- `formatDaysOverdue`: os dias restantes não descontavam os anos (400 dias
  saíam "1ano 1mês 10d"; certo 5d);
- valor da parcela = `valor_original` (base dos totais Total/Pago/Falta),
  com "reaj." quando o reajustado difere (~460 parcelas); "desc." e "falta"
  em parcela parcial;
- resumo "Maior atraso" na aba Vendas via `clientMaxOverdueDays` (mesma regra
  da carteira, ciente de acordo ativo) e aviso de acordo ativo — atraso dos
  títulos originais em cinza nesse caso;
- parcelas em ordem de vencimento; removido `console.log` a cada recálculo.

### Item 26 — Dados de cadastro do Ciclone (razão social, contato) — 2026-11-06

Pedido do usuário: muitos clientes do Ciclone não usam o nome da empresa e os
cobradores ficam confusos. Diagnóstico: o sync gravava só o **nome fantasia**
(`nomefantasia or nome`) e descartava a razão social — 1.828 dos 1.891
clientes têm os dois diferentes ("OTICAS ELISA" × "LUCIANO DA SILVA MOURA
LTDA"). Contato, vendedor e região também não vinham.

Decisão (usuário, recomendada): `clientes.nome` **continua o fantasia** (busca,
listas e histórico intactos); colunas novas para o resto.

- **Migration `20261106000011_clientes_dados_erp`**: `razao_social`,
  `contato_nome`, `contato_telefone`, `contato_telefone2`,
  `vendedor_responsavel` (nome via `pg_funcionario`), `regiao`
  (`pg_regiao.pgreg_descricao`), `observacao_erp`, `erp_atualizado_em`.
  **Espelho do ERP**: o sync sobrescreve sempre (inclusive apagando);
  diferente de nome/telefones/e-mail, que ele só preenche se vazios. Correção
  desses campos é no Ciclone. Fora do Ciclone ficam `NULL`.
- **Sync** (`Ciclone/Esquema_SQL/sync_cobranca/sync_financeiro.py`, fora do
  git): `CAMPOS_ERP`/`CAMPOS_EDITAVEIS`; só regrava cliente com diferença;
  `'null'` literal da observação vira `NULL`; se a migration não estiver
  aplicada, segue sem os campos novos (warning no log) — os títulos não param.
  Dry-run conferido 2026-11-06 (joins 1:1, 35.767 títulos, mesma contagem).
- **Front**: regra única em `src/utils/clienteNome.ts`
  (`razaoSocialDistinta` — só mostra se diferente do nome;
  `nomeJuridicoCliente` — razão social para documento jurídico). Razão social
  entra na busca (filtros, Atribuição, agenda do externo), na lista do
  cobrador, na Atribuição (+ coluna no Excel), no cabeçalho e em "Ver Dados"
  da ficha (com bloco "Falar com" e "Dados do Ciclone"), e no **Termo de
  Acordo/resumo, que agora saem em nome da razão social** do CPF/CNPJ.
  `clientesRegistry` tenta as colunas novas e cai para as anteriores sem a
  migration.
- **Ficou de fora**: situação do cadastro (`pgview_situacao`: E/P/I/B/S/A/V/C
  — significado não confirmado), limite/obs. de crédito, e-mail financeiro
  (10 clientes), endereços de cobrança/entrega (só 5/12 diferem).
- Observação: a extração do sync leva ~2,5 min (antes ~25 s) — medido igual
  sem os joins novos, vem do `LATERAL` de baixas da etapa 3a.
- **No ar em 2026-11-06**: `db push` da 0011 + `check:db` OK; sync manual às
  17:13 (1.888 clientes com dados do ERP: razão social 1.888, contato 632,
  telefone 184, vendedor 1.879, região 1.644). Front em `9907c12`.
- **Teste 2026-11-09**:
  - *Gestor, na tela* (OK): Lista de Clientes mostra a razão social sob o
    fantasia e a busca por "M DE JESUS PEREIRA" acha a Ótica Modelo; ficha
    "Ver Dados" com razão social, "Falar com" (Manoel de Jesus Pereira +
    botão Ligar) e "Dados do Ciclone" (vendedor, região BA/SE-1).
  - *Cobrador, por código + dados de produção* (servidor de dev caiu por
    memória antes do teste na tela): o nome exibido vem de `clientes.nome`
    (= fantasia; `mapRowToCollection`), e a RLS `select_dono_ou_gestor` deixa
    o cobrador ler o cadastro dos clientes dele. Hoje só **José – Cobrança
    Interna** tem clientes do Ciclone (263; + 3 do Cobrador Externo Teste):
    todos com cadastro, nome e razão social; 255 com razão ≠ fantasia; os 8
    iguais são 4 CPFs (sem fantasia) e 4 CNPJs cujo nome no ERP já é a razão
    (Otica Nacional Ltda, Oticas Universal Ltda, Fc/Vc Comercio).
  - *Termo de Acordo, por código*: os 3 pontos (resumo "Salvar PDF", Termo na
    criação, Termo reaberto no detalhe) usam `nomeJuridicoCliente`, com a
    mesma chave de `clientesRegistry` da ficha. **Falta abrir o PDF**
    (quebra de linha de razão social longa) — login `jose_focco`.
- **Onde a informação aparece / falta (levantado 2026-11-09):**
  - Já tem razão social: lista do cobrador (card), Atribuição (+ Excel),
    ficha (cabeçalho + "Ver Dados"), `AcordoModal`, Termo/resumo, buscas.
  - "Falar com"/vendedor/região: **só** na ficha "Ver Dados".
  - **Onde o cobrador está falando com o cliente**: `LogContactModal`
    ("Atender": razão social + faixa "Falar com" com telefone clicável) e
    `ContactScheduler` (razão social na lista e na busca) — **feito
    2026-11-09, `cf68ed7`**. A decidir com o usuário: o modal de
    telefones do card (`CollectorDashboard`) não oferece o telefone do
    contato do ERP; a mensagem de WhatsApp do card diz "Olá <fantasia>" — o
    `contato_nome` seria o natural.
  - Fantasia basta (não mexer): telas de gestor (Acompanhamento de Visitas,
    pedidos de cancelamento), relatório de caixa, mapa de rota, notificações.

### Item 25 — Distribuição da carteira por regra — 2026-11-06

Pedido do usuário: a faixa no cadastro de Usuários não fazia sentido sozinha
(só alimentava "Clientes urgentes" e o painel do Resumo; nada entregava
cliente a ninguém). Ideia dele: "José: 1 a 60 nas lojas X e Y; outro: 61 a
120 na loja Z", centralizado. Crítica feita e recomendações aceitas ("faça
logo, aplicando as melhores propostas"):
- **Regra = faixa (inclusiva) + lojas** por cobrador, 1 vigente por cobrador
  (`collector_overdue_ranges.lojas`, NULL = todas). Teto passou de exclusivo
  para **inclusivo** ("1 a 60" cobre o dia 60): `faixa_cobre_cliente` no banco
  e `faixaCobreAtraso`/`diasAteSairDaFaixa` em `filters/priority.ts`;
  `clientes_fora_da_faixa` ajustada (corpo copiado de produção).
- **Tela nova "Distribuição"** (`CarteiraDistribuicao.tsx`, menu do gestor):
  regras editáveis por linha; cobertura por loja (barras, buracos "sem
  cobertura", trechos "divididos"); **simular** (`distribuicao_carteira_previa`,
  só leitura) e **aplicar** (`aplicar_distribuicao_carteira`, confirmação em 2
  cliques, recalcula o plano no servidor, motivo `distribuicao_regra` no
  histórico de atribuições).
- Plano (`plano_distribuicao_carteira`, interna): só mexe em cliente sem
  cobrador ou cujo cobrador tem regra que não o cobre mais; cobrador sem regra
  = carteira manual intocada. Sobreposição divide pela carga (quem tem menos
  clientes em aberto recebe). Loja do cliente = loja do título em aberto mais
  atrasado. Fora: Falecido; "Aguardando <perfil>" só vai para aquele perfil.
  Acordo/agendamento ativo travam. Regra de situação vem de
  `config/profiles.distribuicaoPerfisPayload` (não duplicada no SQL).
- `distribuir_clientes_cobradores()` (legada, qualquer logado executava,
  distribuía tudo para `collector` inclusive inativos, sem auditoria) **removida**.
- Usuários refeita: valores visíveis por linha (faixa+lojas → abre
  Distribuição; gestor; meta do mês), busca, filtro por perfil, inativos
  ocultos, ações visíveis, dark mode. "Faixa & Equipe" virou só gestor.
  `encerrar_faixa_atraso_cobrador` (migration 6) permite remover a regra.
- **Testado em transação desfeita (ROLLBACK) em produção** com as regras de
  hoje (Francisco 1–60, José 3–948): ~4 s; 1.769 entram, 323 trocam, 309
  ficam sem cobrador, 71 travados por agendamento, 1.286 sem regra. Nada
  gravado (coluna `lojas` conferida inexistente depois).
- **Revisão (mesmo dia), migration `20261106000008`**: comparando com o Cedrus
  (a mesma cobradora com "3 a 60" e "366 a 948" nas mesmas lojas), o usuário
  pediu **várias regras por cobrador**, **sem dois cobradores na mesma faixa
  e loja**, e lembrou que o cliente sem tratamento migra entre cobradores e
  volta a ficar sem ninguém se sair da faixa de todos; atraso sempre pela
  **parcela vencida mais antiga** (loja = a dessa parcela). Feito: sai o índice
  de 1 regra vigente; `salvar_regra_carteira` (cria/edita uma regra, recusa
  sobreposição com mensagem "Conflito com a regra de X…", `LOCK` contra
  corrida) e `encerrar_regra_carteira` substituem definir/encerrar por
  cobrador; `cliente_loja_referencia` (SQL) e `clientReferenceStore` (TS);
  plano e `clientes_fora_da_faixa` consideram qualquer regra do cobrador;
  `executar_saida_carteira_fora_da_faixa` removida; Clientes urgentes emendam
  regras contíguas do mesmo cobrador (`diasAteSairDasRegras`); tela com
  "+ Adicionar faixa" por cobrador e "Conflito" em vermelho na cobertura.
  Testado em transação desfeita como gestor: 2ª faixa da Monalisa aceita,
  José 30–90 em Crateús recusado, José 61–365 (vizinha) aceito, plano ok.
  Obs.: as 2 regras de teste (Francisco, José) foram encerradas pelo usuário
  na tela; nenhuma distribuição aplicada ainda.
- **Ativa/pausada e saída pelo teto (migrations `0009`/`0010`)**: regra tem
  `ativa` (como a coluna "Ativo" do Cedrus). Decisões do usuário após ver a
  simulação: inativa = **pausada** (não entrega cliente novo, mas o cobrador
  mantém os que já tem nela); cliente **abaixo da primeira faixa** do cobrador
  na loja fica com ele (atraso só cai quando paga — sem vai-e-vem); cliente no
  **buraco entre faixas** do mesmo cobrador sai. Conflito só entre regras
  ativas (rechecado ao ativar, `definir_regra_carteira_ativa`).
- **Aplicado em produção 2026-11-06 19:12 UTC** (gestor Erick, pedido explícito
  do usuário): regras do Cedrus — Monalisa 3–60 ativa (Crateus, Crateus Ext,
  Novo Oriente) e 366–948 pausada (+ Independencia); José 3–60 e 61–90 ativas,
  91–365 e 366–948 pausadas (Focco Brasil). Resultado: 71 entraram na Monalisa
  (situação "Cobrança Interna"), 310 saíram dela para sem cobrador (204 no
  buraco 61–365, 72 acima de 948, 34 de lojas fora das regras dela); José sem
  mudança. Ressimulação depois: 0 movimentos. Monalisa ficou com 845 clientes.
- **Mesma noite, demais cobradores do Cedrus** (aplicado com "pode aplicar" do
  usuário a cada passo): Jonathan (3–60 ativa em Excellence Eusébio — "Excellence"
  do Cedrus assumido como Eusébio —, Messejana e Independência; 61–90, 91–365,
  366–948 pausadas) +56; Aline Freitas (Poranga 3–60 ativa, 366–948 pausada)
  +76; Aline (Itapipoca 3–60, 61–90, 91–365 e 366–948 com Itapipoca Ext, todas
  ativas) +332; Vanessa (Quiterianópolis 3–60, 61–90, 366–948, todas pausadas)
  0. Depois, a pedido ("clientes fora das faixas podem sair"), **retirados 782**
  clientes que estavam fora das faixas ATIVAS (Monalisa 559: 350 em faixa
  pausada + 209 abaixo da 1ª faixa; José 223: 33 + 190), via UPDATE em
  transação com motivo `distribuicao_regra` — operação pontual, a regra do
  plano (0010) continua mantendo pausada/abaixo da 1ª faixa nas próximas
  distribuições. Carteiras finais: Aline 332, Monalisa 286, Aline Freitas 76,
  José 56, Jonathan 56. Ressimulação: 0 movimentos.
- Pendente: teste ao vivo de Usuários e do "Atender" (item 24); automação diária (fase 2) não feita;
  automação diária (fase 2) não feita de propósito; "Clientes urgentes" e
  o painel do Resumo seguem só por dias (sem loja).

### Item 24 — "Registrar contato" unificado (cobrador de carteira) — 2026-11-06

Pedido do usuário: "Registrar Interação" e "Reagendar" eram dois botões de um
fluxo só. Problemas encontrados no desenho antigo:
- "Não atendeu" pelo Registrar marcava o agendamento como **realizada** e não
  criava o próximo; o "Agendar" seguinte nascia **fora da cadeia** de
  reagendamento (Reincidentes não via).
- Reagendar **não gravava tentativa** nem observação: histórico de Tentativas
  vazio e o cliente seguia na seção "Sem contato" mesmo ligando todo dia.

Agora (decisões do usuário, com as recomendações):
- Um modal (`LogContactModal`, título "Registrar Contato"): resultado,
  observação, data da promessa e **próximo contato** (canal/data/hora,
  sugerido pelo resultado: não atendeu/mensagem → amanhã; promessa → dia
  seguinte ao prometido). Mostra antes de salvar o que vai acontecer.
- **Contato efetivo** → agendamento ativo vira `realizada` (conta na meta) e
  o próximo é um agendamento novo de **acompanhamento**. **Não efetivo** com
  próximo → `reagendada` na mesma cadeia, motivo derivado do resultado
  (`rescheduleReasonForAttemptResult`, `attemptReschedulesActiveContact` em
  `config/collectionAttempts.ts`). Sem próximo → `realizada`, como antes.
- Modo **"Só remarcar (sem contato)"** dentro do mesmo modal, com os motivos
  de reagendamento — usa a `reagendar_visita` direto, sem tentativa.
- Tudo numa transação: RPC `registrar_contato` (migration
  `20261106000004`, `SECURITY INVOKER` — RLS de `collection_attempts` e
  `scheduled_visits` faz o papel do guard). Confere que o agendamento ativo
  que a tela viu ainda é o do banco; SPC libera a carteira na mesma transação
  (antes um erro na liberação era só logado).
- `RescheduleContactModal` removido; na linha da carteira o botão de
  calendário só aparece para **agendar** quando não há contato agendado.
- Montador das notas de reagendamento saiu do `CollectionContext` para
  `config/rescheduleReasons.buildRescheduleNotes` (usado pelos dois caminhos).

Migration aplicada em 2026-11-06, `check:db` OK (função INVOKER, sem EXECUTE para anon).
**Testado ao vivo em 2026-11-06** (Cobrador Externo Teste, cliente João Siriano
Soares atribuído para o teste), conferido no banco: (A) não atendeu sem
agendamento → cria acompanhamento; (B) não atendeu com agendamento →
`reagendada`, motivo `nao_atendeu_reagendar`, cadeia from/to ok; (C) promessa →
`realizada` + novo agendamento no dia seguinte à promessa; (D) só remarcar →
`reagendada` sem tentativa; (E) SPC → `realizada` + cliente liberado
("Aguardando Jurídico", sem cobrador). 5 tentativas por registro (5 títulos em
aberto). Registros de teste apagados depois, a pedido do usuário (cliente
voltou a sem cobrador/sem situação).
Observação: registrar ANTES do dia agendado sugere "amanhã", que pode ser a
mesma data do agendamento atual (remarcação para o mesmo dia).

**Revisão, mesmo dia — "Atender" em 2 etapas** (pedido do usuário: "Registrar
contato" e "Agendar contato" faziam a mesma pergunta — quando falo com ele de
novo — em dois botões). Só tela, sem migration; cada caminho chama o mesmo de antes:
- Botão único **"Atender"** na linha da carteira (o de agendar sumiu;
  `ScheduleContactModal` removido). **Cancelar agendamento continua botão
  próprio** (ação diferente, com motivo).
- Etapa 1 "O que aconteceu": **Fiz o contato** (resultado/observação/promessa)
  ou **Não fiz contato** (com agendamento: motivo da remarcação; sem: só
  agenda). Etapa 2 "Próximo contato" **obrigatória**: canal/data/hora
  sugeridos, observação quando nasce agendamento novo, e checkbox "Não agendar
  próximo contato" (antes, data vazia = sem próximo implícito; agora a escolha
  é explícita). Resultado SPC salva direto da etapa 1.
- Caminhos: fiz contato → `registrar_contato`; não fiz com agendamento →
  `rescheduleVisit` (canal fixo, igual ao "só remarcar"); não fiz sem
  agendamento → `scheduleVisit` (igual ao antigo Agendar). A observação do
  agendamento de acompanhamento vai anexada em `p_notas_proximo`.
- Trava de 400 ms no submit ao entrar na etapa 2 (ghost click, mesmo caso do
  `AcordoModal`). Não testado ao vivo ainda.

### Item 23 — validar data de parcela não pode ser anterior a hoje — 2026-11-04

Observação do usuário: nada impede, de fato, criar uma parcela com
vencimento no passado. Hoje o único freio é o atributo `min={todayLocalStr()}`
no `<input type="date">` da etapa 3 (`AcordoModal.tsx`) — isso só restringe o
calendário nativo do navegador; não há checagem equivalente em
`handleAvancarParcelas` (que hoje só confere `valor > 0` e `data` não-vazia).
Entrada ("Data da 1ª parcela"/`aplicarDataBase`) também não é validada.
Falta: checar `p.data >= todayLocalStr()` (comparação de string
`YYYY-MM-DD`, sem `Date`/fuso) nessa validação, com mensagem de erro
específica. Não iniciado — só anotado a pedido do usuário.

### Item 22 — histórico de cancelamento (acordo / agendamento) — 2026-11-04

Observação do usuário ao cancelar manualmente em produção o Acordo e o
agendamento/contato do cliente 924.457.801-87: hoje a única tela de
histórico que ele vê é "Histórico de Contatos" dentro de `ClientDetailModal`
→ "Ver Dados" (lê `collection_attempts`). Verificado no código:
- **Acordo**: `cancelar_acordo` (migration `20261030000005`) grava o
  cancelamento na própria linha (`status='cancelado'`, `motivo_cancelamento`,
  `resolved_at`) — o fato fica no banco, mas não há nenhuma tela que liste
  acordos cancelados/quebrados de um cliente.
- **Agendamento/contato**: `cancelScheduledContact` (item 16, commit
  `98a30e4`) grava `status='cancelada'` reaproveitando
  `cancellation_request_date`/`_reason` na própria linha de
  `scheduled_visits` — mesma situação, dado existe, sem tela.

Não é perda de dado, é lacuna de UI. A avaliar: uma aba "Histórico" no
`ClientDetailModal` que junte visitas/contatos cancelados + acordos
cancelados/quebrados, ou basta listar na aba "Ver Dados" existente. Não
iniciado.

### Item 21 — diagnóstico das modalidades de cobrança (externo/interno/terceirizado/jurídico) — 2026-11-04

Pedido do usuário: avaliação crítica e honesta da lógica operacional das 4
modalidades (redundância, inconsistência, diferenças que deveriam/não
deveriam existir, complexidade desnecessária, lacunas, indicadores,
arquitetura) — feita por leitura de código real (`ClientAssignment.tsx`,
`BulkAssignmentModal.tsx`, `AllowedVisitDatesManager.tsx`, migrations de
acordo/faixa de atraso), não por memória. Diagnóstico completo (com "como
funciona hoje / problema / solução recomendada / prioridade" por item) fica
no histórico da conversa — os achados acionáveis viraram os itens 14-21
acima. Ordem sugerida de execução (confirmar com o usuário a cada um,
etapas pequenas, testar antes de seguir — ver [[trabalho-em-etapas]]):
1. ~~Item 14 (guard de agendamento ativo)~~ — concluído, ver detalhe abaixo.
2. ~~Item 15 (transferência não filtra canal)~~ — concluído, ver detalhe
   abaixo (inclui a correção derivada do bug de órfão por guard do item 14).
3. ~~Item 20 (helper `isWalletCollectorType`)~~ — concluído, ver detalhe
   abaixo.
4. ~~Item 17 (unificar liberação de carteira)~~ — concluído, ver detalhe
   abaixo.
5. ~~Item 16 (cancelamento de contato)~~ — concluído, ver detalhe abaixo.
6. ~~Item 18 (`AllowedVisitDatesManager` restringir a externo)~~ — concluído,
   ver detalhe abaixo.
7. ~~Item 19 (documentar dualidade de `visits_goal`)~~ — concluído, ver
   detalhe abaixo.
8. Item 21 (Jurídico) — próximo e último. Depende de decisão de negócio, não é só código;
   perguntar como a cobrança jurídica funciona de verdade hoje fora do
   sistema antes de desenhar qualquer coisa.

### Item 19 — documenta dualidade de `visits_goal` + corrige divergência no cálculo — concluído 2026-11-04

Pedido original: `monthly_goals.visits_goal` muda de significado por
perfil (visita presencial pro Externo, contato EFETIVO pra carteira) sem
isso aparecer no schema nem na UI de indicador — só no modal de edição da
meta. **Escopo expandido com confirmação do usuário**: ao investigar,
achei que `CollectorPerformanceModal.tsx` (histórico mensal por cobrador)
calculava `visitsInMonth` contando qualquer `status === "realizada"`,
SEM aplicar o filtro de contato efetivo que `CollectorDashboard.tsx` e
`EnhancedPerformanceChart.tsx` já aplicavam — inflava o % de carteira
nesse modal especificamente (3º lugar calculando a mesma regra, divergente
dos outros 2).

Corrigido na raiz: `countsTowardVisitsGoal(visit, isWalletCollector)` nova
em `config/collectionAttempts.ts`, fonte única da decisão "essa
visita/contato bate meta?". `CollectorDashboard`/`EnhancedPerformanceChart`
passaram a chamá-la em vez de reimplementar a mesma condição inline;
`CollectorPerformanceModal` ganhou a chamada que faltava — hoje os 3
lugares usam a mesma função.

Documentação: `COMMENT ON COLUMN monthly_goals.visits_goal` (migration
`20261104000006`, **não aplicada em produção ainda**) explicando a
dualidade e apontando pra `countsTowardVisitsGoal` como fonte única.
Rótulo na UI: `CollectorPerformanceModal` mostra "Contatos" em vez de
"Visitas" pra cobrador de carteira (mesmo padrão já usado em
`CollectorsSummary.tsx`); o card agregado de equipe em
`EnhancedPerformanceChart` ganhou tooltip explicando que soma visita
presencial + contato efetivo quando a seleção mistura perfis. `tsc -b`/lint
sem regressão nos 4 arquivos tocados (ajustei a dependência de um
`useMemo` que o eslint sinalizou).

### Item 18 — restringe `AllowedVisitDatesManager` a Externo — concluído 2026-11-04

`AllowedVisitDatesManager` deixava o gestor escolher qualquer um dos 4
perfis de cobrador no dropdown, mas só `VisitScheduler`
(`getNextAllowedVisitDate`, `utils/visitScheduling.ts`) de fato lê
`allowed_visit_dates` — carteira (interno/terceirizado/jurídico) agenda
contato por `ScheduleContactModal`/`ContactScheduler`, que nunca consulta
essa tabela. Configurar data permitida pra um cobrador de carteira seria
config morta, sem nenhum aviso. **Confirmado em produção antes de
restringir** (Management API, read-only): as 93 linhas existentes em
`allowed_visit_dates` são todas de cobradores `collector` — nenhuma de
carteira seria afetada. Dropdown de `AllowedVisitDatesManager` agora filtra
só `type === "collector"` em vez de `isCollectorType` (os 4 perfis).
`tsc -b`/lint limpos.

### Item 16 — cancelamento direto de contato agendado — concluído 2026-11-04

Cobrador de carteira só tinha concluir/reagendar um contato ativo, nunca
cancelar — diferente da visita presencial, que tem fluxo de cancelamento
com aprovação do gestor (`requestVisitCancellation`/`approveVisitCancellation`,
status `cancelamento_solicitado`). **Decisão confirmada com o usuário**:
cancelamento DIRETO (sem aprovação) pra ligação/WhatsApp, só com motivo —
diferente da visita, não há custo de deslocamento perdido que justifique
exigir aprovação.

Implementado: `cancelScheduledContact(visitId, reason)` em
`CollectionContext` — confere o status real no banco antes (mesma cautela
do `rescheduleVisit`), recusa se o canal for `presencial` (defensivo; essa
função só é chamada pela tela da carteira) e grava `status: "cancelada"`
direto, reaproveitando as colunas `cancellation_request_date`/`_reason`
(sem preencher `cancellation_approved_*`, que são exclusivas do fluxo com
aprovação). `CancelContactModal.tsx` novo (mesmo padrão visual de
`RescheduleContactModal`, textarea de motivo, sem `window.confirm`/`alert`
nativo). Botão "Cancelar contato agendado" no `ClientQueueRow`
(`CollectorDashboard.tsx`), visível só quando há `scheduledContact`, ao
lado do botão agendar/reagendar — thread de prop `onCancelContact` por
`InternalCollectorWallet`→`AgendaSection`→`ClientQueueRow` (reusado nas
duas seções, agenda priorizada e Carteira completa). `tsc -b`/lint sem
regressão. **Testado só até onde o navegador permite sem login** (sem
credencial de cobrador de carteira à mão nesta sessão) — usuário precisa
confirmar o clique end-to-end manualmente.

### Item 17 — unificar "desfecho libera cliente da carteira" — concluído 2026-11-04

`config/visitOutcomes.ts` já era o ponto único pra visita presencial
(`visitReleaseSituacao`, casando o TEXTO exato da nota contra
`VISIT_OUTCOMES`), mas ligação/WhatsApp tinha sua própria regra isolada —
um `if (status === "contestou_divida")` direto em `LogContactModal.tsx`,
com a situação `"Aguardando Jurídico"` duplicada como constante local
(`SITUACAO_SPC`). Unificado: `visitOutcomes.ts` ganha `SITUACAO_SPC`
exportado (usado também pela entrada `spc` do catálogo de visita) e
`releaseSituacaoForAttemptResult(result)` — mesma decisão, mas com o
gatilho sendo o `result` ESTRUTURADO de `collection_attempts` (`disputed`)
em vez de texto de nota de visita (que não existe pra ligação/WhatsApp).
`LogContactModal` chama essa função em vez de comparar a string do
dropdown (`status`), então um resultado "disputed" futuro vindo de outro
fluxo (não só esse dropdown) herdaria a liberação automaticamente. `tsc
-b`/lint limpos.

### Item 20 — helper `isWalletCollectorType` — concluído 2026-11-04

Terceiro item da ordem combinada (aquecimento, zero risco). `WALLET_COLLECTOR_TYPES.includes(x as (typeof WALLET_COLLECTOR_TYPES)[number])`
estava repetido ipsis litteris em 7 lugares (`CollectorDashboard.tsx`,
`MonthlyGoalEditModal.tsx`, `EnhancedPerformanceChart.tsx`,
`CollectorsSummary.tsx` ×4). Extraído `isWalletCollectorType(type)` em
`src/config/profiles.ts`, ao lado de `WALLET_COLLECTOR_TYPES`; os 7 lugares
agora chamam a função em vez de repetir o cast. `tsc -b` limpo, lint sem
regressão em nenhum dos 5 arquivos tocados.

### Itens 14 e 15 — guard de agendamento ativo + filtro de canal na transferência — concluídos 2026-11-04

Primeiros dois itens da ordem combinada após o diagnóstico (item 21 abaixo).

**Item 14.** `cliente_tem_visita_agendada_ativa` (criado na automação de
saída por faixa, `20261103000006`) não estava em `atribuir_clientes_em_lote`/
`remover_cobrador_em_lote` — só `cliente_tem_acordo_ativo` travava. Gestor
podia reatribuir/remover cliente com visita/ligação/WhatsApp agendado pra
hoje sem aviso, deixando o agendamento órfão (continuava apontando pro
cobrador antigo). Migration `20261104000005`: mesmo padrão de bloqueio
silencioso (exclui da `UPDATE` via `WHERE`, sem exceção nem contagem
separada) que o guard de acordo já usa nas duas RPCs. **Não aplicada em
produção ainda** — passar pro usuário: `supabase db push`.

**Item 15.** `BulkAssignmentModal`/`assignCollectorToClients` perguntava
"transferir agendamentos?" e movia TODO agendamento `agendada` pro cobrador
novo, sem checar se o canal existe no perfil de destino (ex.: ligação indo
pra um cobrador Externo, que só usa `VisitScheduler` presencial). Nova fonte
única `channelsForCollectorType`/`CHANNELS_BY_PROFILE`
(`src/config/profiles.ts`) mapeia Externo→`presencial`, carteira
(Interno/Terceirizado/Jurídico)→`ligação`/`whatsapp`; a transferência real
(`scheduled_visits.update`) e o patch otimista (`applyLocalAssignment`) e a
contagem exibida no aviso (`pendingVisitsCount`) passam a filtrar por esse
canal.

**Correção derivada, mesma sessão**: implementando o item 15 ficou claro que
a transferência de agendamento (rede e patch otimista) rodava pra **todos**
os clientes do lote, sem checar se o item 14 bloqueou a reatribuição daquele
cliente específico — ou seja, mesmo bloqueado pelo guard novo, o
agendamento ainda migrava pro cobrador novo sozinho, ficando órfão do lado
oposto (cliente com o cobrador antigo, agendamento apontando pro novo).
Corrigido em `assignCollectorToClients`: depois do `UPDATE` em lote, confere
no `BANCO_DADOS` quais documentos candidatos (que têm agendamento aberto e
canal compatível) *de fato* ficaram com `user_id = collectorId` antes de
mover o agendamento — só esses são migrados. A função passa a devolver
`transferredVisitDocs`, que `BulkAssignmentModal` usa tanto pro log final
quanto pro patch otimista (`applyLocalAssignment` ganhou um 4º parâmetro),
pra UI não divergir do servidor.

**Decisão em aberto, não resolvida nesta sessão**: com o guard do item 14
ativo, um cliente com visita/contato ativo **nunca** é reatribuído por essas
duas RPCs — nem quando o gestor escolhe explicitamente "Sim, transferir
agendamentos" no prompt do `BulkAssignmentModal`. Antes do item 14 esse
fluxo funcionava (o agendamento ia junto); agora ele fica parado com o
cobrador atual, silenciosamente (sem orfão, mas também sem transferir nada,
mesmo quando o gestor pediu). Perguntar ao usuário se isso é aceitável
(manager cancela/conclui o agendamento antes de reatribuir) ou se o guard
precisa de uma exceção quando o chamador confirma que vai mover o
agendamento junto.

### Item 13 — agendamento de contato pro cobrador de carteira — concluído 2026-11-04

Pedido do usuário: cobrador interno/terceirizado/jurídico (ligação/WhatsApp)
ganhar agendamento equivalente ao do cobrador externo (visita presencial),
com os mesmos indicadores no painel do gestor, reagendamento, reincidência,
SPC e meta — "não quero copiar, quero adaptar", depois confirmado "pode
reaproveitar o que já existe". Decisão de arquitetura: generalizar
`scheduled_visits` (campo `channel`) em vez de criar tabela paralela —
reaproveita RPC de reagendamento, índice único e indicadores quase sem
mudança de código. Decisões de negócio fechadas com o usuário: agendamento
com data/hora futura; reagendar = remarcar tentativa; meta conta **contato
efetivo**, não qualquer tentativa; cidade/bairro só agrupam a seleção (não
estende `allowed_visit_dates`, que é sobre logística de rota física,
inaplicável a telefone); agendamento em massa como página própria no menu,
não um modo de seleção dentro da Carteira completa.

9 etapas, todas commitadas, `tsc -b`/lint limpos em cada uma (plano salvo
em `C:\Users\User\.claude\plans\rosy-brewing-pond.md`, não está no repo):
1. **Migration**: coluna `channel` em `scheduled_visits` (default
   `'presencial'`, sem impacto em fluxo existente) + RPC `reagendar_visita`
   propagando o canal (commit `63242d9`). Aplicada em produção.
2. **Config**: `rescheduleReasons.ts` ganha motivos por canal;
   `collectionAttempts.ts` ganha `isEffectiveAttemptResult`/`isEffectiveLabel`
   (commit `5e24c8b`). `visitOutcomes.ts` ficou intocado de propósito —
   desfecho de ligação/WhatsApp reaproveita o vocabulário que já existia em
   `ATTEMPT_RESULT_LABELS`/`LogContactModal`, sem duplicar catálogo.
3-5. **Agendar/concluir/reagendar + fila priorizada** (commit `7046507`):
   `ScheduleContactModal`/`RescheduleContactModal` novos; `LogContactModal`
   fecha o agendamento vinculado via `updateVisitStatus` (já existente, sem
   função nova); nova categoria "Agendados para hoje" (maior precedência) na
   agenda priorizada do cobrador; opção "Contestou a Dívida (SPC)" libera o
   cliente pra "Aguardando Jurídico" (mesma regra da visita, caminho
   próprio — ver item 17 acima); widget de acompanhamento diário.
6. **Meta por contato efetivo** (commit `20b816b`): `getMetricsByPeriod`
   (`CollectorDashboard`) e `visitsPerformance`
   (`EnhancedPerformanceChart`) passam a contar só contato efetivo pro
   cobrador de carteira — a contagem "Realizada" exibida continua igual
   (volume de trabalho) pros dois.
7. **Painéis do gestor** (commit `ecf2523`): `VisitTracking` mostra
   canal em vez de endereço quando não é presencial; `CollectorsSummary`
   generaliza rótulos "visitas"→"agendamentos"/"contatos".
8. **Agendamento em massa** (commit `644bd6f`): `ContactScheduler.tsx`
   novo — filtro por nome/CPF/cidade, seleção múltipla, mesma
   data/hora/canal pra todos, reaproveitando `scheduleVisit` em loop. Nova
   entrada "Agendamentos" no menu (só pros 3 perfis de carteira). Gestor
   acessa via botão "Agendar em massa" no Resumo por Cobrador
   (`CollectorsSummary`), sem precisar logar como o cobrador. **Corrigido
   de caminho**: botão "Nova Visita" do gestor em `VisitTracking` só
   aparece pra cobrador externo agora (antes abriria o `VisitScheduler`
   presencial por engano pra um cobrador de carteira).

**Testado parcialmente ao vivo** (navegador, sessão já logada): login real
de cobrador terceirizado de teste mostrou o widget diário, a categoria
"Agendados para hoje", o badge do canal e os botões agendar/reagendar
funcionando com dado real (cliente João Siriano Soares, 1 ligação ativa).
Manager (`eobx@hotmail.com`) confirmado logando e abrindo o Resumo — não
cheguei a testar o clique no botão "Agendar em massa" nem a submeter nada
novo (interrompido pelo usuário pra pedir o diagnóstico abaixo). **Falta**:
teste de submissão real (agendar/concluir/reagendar de verdade) e do botão
do gestor — usuário vai terminar o teste manualmente.

### Item 12 — atraso ciente de acordo + Termo de Acordo automático — em andamento

Pedido do usuário em 2026-11-04 (conversa original + WhatsApp com o Fábio,
dono do negócio, sobre encargos de acordo). Três frentes:

**A) Atraso ciente de acordo ativo — concluída 2026-11-04 (`9f6cb4c`)**
`clientMaxOverdueDays`/`cliente_max_atraso_dias` (migration
`20261104000001`) passam a usar o cronograma do acordo ATIVO (parcelas
novas) em vez do vencimento do título original quando há acordo em
andamento — o título é fato histórico imutável e ficava com data pré-acordo
pra sempre. `CollectionContext` carrega em lote (`acordoAtivoOverdueMap`,
junto de `fetchAcordos`) as parcelas em aberto dos acordos ativos. Acordo
cancelado/quebrado/cumprido volta sozinho a usar o título (basta não estar
mais `ativo`, sem caminho de reversão à parte). Pílula "Atraso" (Minha
Carteira) também corrigida (quebra de linha em números grandes).
Migration `20261104000001` ainda **não aplicada** em produção (passar pro
usuário: `supabase db push`).

**B) Termo de Acordo automático — em andamento.** Hoje `AcordoModal` não
aplica NENHUM encargo (só divide o saldo selecionado em N parcelas iguais).
Fábio confirmou que pode haver multa/juros, "de forma flexível"; decisão do
usuário: padrão definido pelo gestor, editável pelo cobrador por
negociação. Fórmula confirmada batendo com o modelo de Termo que o usuário
mandou (`Termo_Acordo_Exemplo.pdf`, não commitado): multa 2% flat sobre o
saldo do título + juros simples (não compostos) % a.m. pro-rata pelos dias
de atraso do título (`saldo × taxa_mensal × dias/30`) — "C. Monetária" e
"Honorário" ficam fora do escopo (zerados no exemplo real). Plano em 3
etapas:

- **3a — Configuração padrão (gestor) — concluída 2026-11-04, aguardando
  `db push`.** Nova tabela `acordo_configuracao_padrao` (migration
  `20261104000002`, com vigência histórica, mesmo padrão de
  `collector_overdue_ranges`): multa %, juros % a.m., desconto padrão % (0
  por padrão) e máximo %, dias entre parcelas (hoje fixo em 30 no
  `AcordoModal`, sem limite de número de parcelas), dados da empresa (nome,
  CNPJ, endereço, chave Pix). RPC `definir_configuracao_padrao_acordo`
  (fecha vigente, abre nova, só gestor). Tela nova
  `AcordoConfiguracaoPadrao.tsx`, aba "Config. de Acordos" no painel do
  gestor (`src/config/navigation.ts`). `tsc`/`eslint` ok (contagem igual a
  HEAD). `database.types.ts` tem a tabela/RPC adicionadas à mão (migration
  ainda não aplicada — regenerar com `supabase gen types` depois do
  `db push` pra conferir contra o schema real).
- **3b — `AcordoModal` aplica o padrão (cobrador) — concluída 2026-11-04,
  aguardando `db push`.** Migration `20261104000003`: `acordo_titulos` ganha
  `dias_atraso_no_momento`/`multa_valor`/`juros_valor`/`desconto_valor`
  (congelados, nunca recalculados — o Termo gerado depois tem que mostrar o
  que foi negociado naquele dia); `acordos` ganha `forma_pagamento_parcelas`,
  `testemunha{1,2}_{nome,cpf}` e os 3 percentuais efetivamente aplicados
  (podem divergir do padrão do gestor se o cobrador editou).
  `criar_acordo` (RPC) estendida com `CREATE OR REPLACE` (parâmetros novos
  com default no final — chamada antiga de 3 args continua resolvendo pra
  mesma função, sem quebrar nada em voo). `AcordoModal` virou wizard de 3
  passos: 1) títulos (igual); 2) multa/juros/desconto (editável, com o
  padrão do gestor como valor inicial), parcelas (agora somam o **total
  negociado** = saldo + multa + juros − desconto, não mais o saldo cru),
  forma de pagamento das parcelas 2+ e testemunhas (opcionais); 3)
  confirmação da entrada — a 1ª parcela é sempre a entrada via Pix: QR
  Code/copia-e-cola gerado 100% local (`src/utils/pix.ts`, payload BR Code
  do Bacen com CRC16-CCITT, **sem gateway/serviço externo** — decisão do
  usuário 2026-11-04), cobrador marca manualmente "confirmo que recebi" e
  só então o botão "Criar Acordo" libera. Ao criar, a 1ª parcela já nasce
  paga (`registrarPagamentoAcordo` chamado logo em seguida, com a data de
  hoje) — se esse passo falhar o acordo não é desfeito, só fica sem a
  entrada registrada (cobrador resolve pelo detalhe do acordo). Multa/juros
  por título: `saldo × multa% ` + `saldo × juros%am × dias/30` (simples),
  zerados se o título ainda não venceu (`diasAtraso <= 0`). `AcordoDetailModal`
  também mostra a composição (saldo + multa + juros − desconto) por título
  quando há encargo. Nova dependência `qrcode`/`@types/qrcode` (renderiza o
  QR a partir do payload, sem chamada de rede). `tsc`/`eslint` ok (contagem
  igual a HEAD em todos os arquivos tocados).
- **3c — Geração do Termo de Acordo (PDF) — concluída 2026-11-04.**
  `src/utils/termoAcordo.ts` (`gerarTermoAcordoPdf`), 100% client-side
  (`jspdf` + `jspdf-autotable`, novas dependências), sem backend/gateway —
  mesmo espírito do Pix (Etapa 3b). Layout próprio (não copia o modelo de
  referência do usuário), paleta indigo do app: cabeçalho com a logo
  (`src/assets/focco-brasil-logo.png`, commitada), cartões DEVEDOR/CREDOR,
  tabela "Títulos Negociados" (Dias/Vl.Orig/Multa/Juros/Desconto/Total),
  chips de resumo (saldo original / encargos / total negociado), tabela
  "Parcelas Acordadas", seção "Pagamento" com QR Code Pix da entrada +
  copia-e-cola + forma de pagamento das demais parcelas, cláusulas 2ª–4ª
  como **placeholder** (texto jurídico final: usuário vai mandar depois —
  só trocar o texto), assinaturas (devedor/credor/testemunhas), rodapé com
  paginação. O documento é função determinista dos dados já congelados em
  `acordos`/`acordo_titulos`/`acordo_parcelas` — pode ser regenerado
  idêntico a qualquer momento, por isso **não é persistido** (sem Supabase
  Storage, green field que ficou de fora). Dois pontos de disparo: baixa
  automaticamente ao criar o acordo (`AcordoModal`, não trava o fluxo se
  falhar) e botão "Baixar Termo de Acordo" no header do
  `AcordoDetailModal`. Testado com `esbuild` + PDF de exemplo gerado a
  partir de dados mockados (sem browser disponível na sessão) — layout
  conferido via leitura do PDF resultante; **ainda não testado com um
  acordo real criado pelo usuário no app**.
  `AcordoDetailModal` também ganhou: número do acordo (prefixo do `id`,
  mesmo formato do PDF) no header, indicador explícito "Entrada paga/não
  paga" (com atalho "Registrar" quando pendente) logo abaixo dos cards de
  resumo. `CollectorDashboard` ganhou um campo "Buscar acordo pelo nº" (não
  existia nenhuma tela de listagem de acordos pra pendurar isso — abre o
  `AcordoDetailModal` direto pelo prefixo do id).

**Atualização 2026-11-04 (mesmo dia, sessão separada):** `AcordoModal`
virou wizard de **5** passos (Títulos/Encargos/Parcelas/Pagamento/Entrada,
não mais 3) e a lógica da entrada foi reescrita — ela é sempre uma linha
separada (parcela nº1, paga hoje via Pix), nunca uma das N parcelas
digitadas; o valor da entrada desconta do total negociado **antes** de
dividir em N parcelas iguais (um modo alternativo "descontar só da 1ª" foi
tentado e removido por complexidade/caso de borda sem necessidade de
negócio real). Botões novos na etapa 5: "Salvar PDF" (mini-acordo
informativo, `gerarResumoAcordoPdf` em `termoAcordo.ts`) e "Enviar por
WhatsApp" (`wa.me`, texto com resumo + Pix — não anexa o PDF, limitação da
própria API do WhatsApp Web).

- **3d — bug do espelho de pagamento sem encargo — corrigido 2026-11-04,
  aguardando `db push`.** Achado testando a entrada com um cliente real:
  `registrar_pagamento_acordo` espelha o pagamento em
  `BANCO_DADOS.valor_recebido` usando só `valor_original − valor_recebido −
  desconto` como espaço por título — isso foi escrito em 20261031000001,
  **antes** de existir multa/juros por título (que só chegou na Etapa 3b,
  acima). Como ninguém atualizou o espelho, o espaço disponível ficava
  travado no saldo original, menor que o total negociado sempre que há
  multa/juros (ou seja, quase sempre que há atraso — o caso comum de
  acordo). Pagamentos que ultrapassavam esse espaço não tinham onde ser
  aplicados: o título virava "Pago" bem antes do acordo estar de fato
  pago, e o cliente desaparecia da carteira (`hasOpenBalance` lê só
  `BANCO_DADOS`) com parcelas do acordo ainda em aberto. O ledger do
  próprio acordo (`acordo_pagamentos`) continuava correto — só o espelho
  ficava errado. Corrigido na migration `20261104000007`: o espaço por
  título agora soma `multa_valor + juros_valor − desconto_valor`
  (congelados em `acordo_titulos`) ao saldo original ainda não recebido; o
  status "Pago"/"Pago Parcial" passa a comparar contra esse espaço
  estendido. **Pendências**: `db push` da migration, e limpeza manual do
  cliente de teste 924.457.801-87 (título ficou "Pago" incorretamente
  antes da correção — autorizado pelo usuário, "é só teste, pode limpar
  depois").

- **3e — 3d superada: imputação proporcional — 2026-11-05.** A 007 não
  resolvia o sumiço (o título zerava assim que o pago no acordo cobria o
  original; depois disso o espelho jogava encargo no título e deixava
  `valor_recebido > valor_original`) e ainda perdeu o
  `set_config('cobranca.permitir_pagamento_acordo')` da `20261102000005`
  (corpo copiado de migration antiga) — **todo pagamento de acordo falhava**
  no `trg_protege_titulo_em_acordo` desde que ela foi aplicada. Cliente de
  teste 924.457.801-87 limpo em 2026-11-05. Decisão do negócio (chefe do
  usuário, "abate nos dois"): cada pagamento abate valor original e
  encargos **na proporção** em que compõem o valor negociado. Migration
  `20261105000002_acordo_imputacao_proporcional`:
  - `registrar_pagamento_acordo` espelha nos títulos só a parte de original
    (`original/negociado`, limitado a 1), com alvo sobre o **acumulado**
    pago (sem deriva de centavos); no pagamento que cumpre o acordo, alvo =
    total de original. Título só zera quando o acordo acaba → cliente não
    sai mais da carteira/visitas no meio do acordo. Se sobrar saldo no
    título ao cumprir (negociado < original), é baixado como **desconto**.
  - `acordo_pagamentos.valor_principal` / `valor_encargos` gravam a divisão
    (NULL = pagamento anterior à regra).
  - `recebimentos_historico`: origem nova `'acordo'` + coluna
    `acordo_pagamento_id` (antes caía como `'erp_ou_manual'`).
  - Testado com BEGIN/ROLLBACK em produção: 600 em 3× sobre 500 de original
    (166,67/166,66/166,67 de original; cliente ativo até a última parcela) e
    400 em 2× (R$ 100 baixados como desconto ao cumprir).
  - Cláusula Segunda do termo (`termoAcordo.ts`, 2026-11-06): diz que cada
    pagamento abate original e encargos na proporção do negociado (com os
    % e valores do acordo) e afasta o CC art. 354 (juros primeiro); se o
    negociado for ≤ original, diz que tudo abate o original e que a
    diferença vira desconto só ao quitar. Texto a validar com o jurídico.
    Valor em aberto exibido no front segue
    sendo o original restante dos títulos (o saldo com encargos fica na tela
    do acordo); `scheduled_visits.total_pending_value` não é atualizado por
    pagamento de acordo.

Arquivo de referência na raiz do projeto (não commitado, só consulta):
`Termo_Acordo_Exemplo.pdf`.

### Item 11 — título em acordo ativo pagável por fora — concluída 2026-11-02

Achado ao testar a Fase 2 da Etapa 3 (perguntando "e se o cobrador pagar um
título que já está num acordo?"): nenhum caminho de pagamento sabia da
existência de acordos. `process_payment` (Distribuir Pagamento),
`updateCollection` (pagamento de uma parcela via `CollectionModal`) e o
upload em massa de status atualizavam `BANCO_DADOS` direto, sem checar
`acordo_titulos`. O saldo do acordo é calculado só a partir de
`acordo_parcelas`/`acordo_pagamentos` — nunca olha pra `BANCO_DADOS` — então
os dois "livros" podiam divergir: título virava "Pago" mas o acordo
continuava "ativo" pra sempre, sem saber do pagamento.

- Migration `20261102000005_bloqueia_pagamento_titulo_em_acordo.sql`: gatilho
  `BEFORE UPDATE` em `BANCO_DADOS` (`trg_bancodados_protege_titulo_em_acordo`)
  bloqueia qualquer alteração de `status`/`valor_recebido`/`desconto` num
  título vinculado a um acordo `ativo`, **exceto** quando a própria RPC do
  acordo (`registrar_pagamento_acordo`) avisa via `set_config` que é ela
  escrevendo. Resolve na raiz (cobre `process_payment`, `CollectionModal` e
  upload de uma vez, sem precisar de guarda em cada front) — o upload já
  tinha fallback linha-a-linha pra lote que falha, então nenhuma mudança foi
  necessária em `DatabaseUpload.tsx`. `process_payment` também passou a
  excluir títulos de acordo ativo da sua seleção e recusa explicitamente
  (antes de gravar em `sale_payments`) quando não sobra nada pagável — sem
  isso o cobrador ganharia "mérito" por um pagamento que não abateu nada.
- Front (commit `d6cbc42`): modal de confirmação ("Voltar"/"Continuar") ao
  clicar em "Distribuir Pagamento" quando o cliente tem acordo ativo
  (`ClientDetailModal.tsx`), banner de aviso dentro do `GeneralPaymentModal.tsx`
  e no card de pagamento/status do `CollectionModal.tsx`. Reusa
  `getAcordoAtivoDoCliente`, já existente no `CollectionContext`.
- Confirmado por design (não corrigido aqui, só registrado): um cliente
  nunca tem mais de um acordo `ativo` simultâneo — índice único parcial
  `uniq_acordo_ativo_por_cliente` já garante isso no banco desde a migration
  original. `acordo_origem_id` (encadeamento de renegociação após quebra) já
  existe na tabela mas não está implementado em nenhuma tela ainda.
- Testado em transação com `ROLLBACK` contra produção (update direto
  bloqueado, `process_payment` bloqueado pra cliente 100% coberto por
  acordo, `registrar_pagamento_acordo` funcionando normalmente) e aplicado.

### Etapa 3 — tipar `BANCO_DADOS`, fase 1/3 (FK `documento`) — concluída 2026-11-02

Decisão antiga da reorganização do banco (ver item 10 acima e
`estado-reorganizacao-banco`/memória). Levantamento prévio (consultas no
banco + 3 agentes de exploração no front) confirmou que os dados já estão
limpos (dinheiro 100% numérico, datas só ISO/BR conhecidos, zero órfãos em
`documento`↔`clientes`) — o risco real estava em pontos pontuais do código,
não nos dados. Plano completo em 3 fases (FK → dinheiro → datas), front
sempre antes da migration (invertido do fluxo normal, porque aqui é o
código que precisa já estar pronto pra constraint, não o contrário).

- **Fase 1 (FK `documento → clientes(documento)`), commits `e26f30b`
  (reordena `AddTituloModal.tsx`/`DatabaseUpload.tsx` pra criar o cadastro
  do cliente ANTES do título) e `2925075` (migration
  `20261102000002_fk_banco_dados_documento.sql`, `NOT VALID` +
  `VALIDATE CONSTRAINT` — primeira vez que esse padrão aparece no projeto).
  Aplicada e validada em produção (`convalidated = true`).
- **Fase 2 (dinheiro `text` → `numeric`) — concluída 2026-11-02**, commits
  `c7dd211` (front: `src/utils/money.ts` com `parseMoney`, corrige
  `AddTituloModal.tsx`) e `a4f92e5` (migration
  `20261102000004_banco_dados_dinheiro_numeric.sql`). Investigação da
  migration achou raio de impacto no **banco** que o levantamento inicial
  (só front) não cobriu — duas tentativas em `ROLLBACK` contra produção
  antes de acertar:
  - 2 views (`banco_dados_clientes_ativos`/`_quitados`, item 8) e 1 trigger
    (`trg_banco_dados_atualiza_saldo`, por ter `UPDATE OF valor_original,...`
    na própria definição) bloqueiam `ALTER COLUMN TYPE` por dependerem
    estruturalmente das colunas — dropados e recriados idênticos na mesma
    transação da migration.
  - 6 funções em uso real reescritas para usar as colunas numeric
    diretamente, sem `REPLACE(...)`/`texto_para_valor(...)`/`TO_CHAR(...)`:
    `trg_atualiza_saldo_por_documento`, `process_payment`,
    `registrar_pagamento_acordo`, `cancelar_vendas`,
    `trg_recebimentos_historico_ins`/`_upd`.
  - Achados à parte, decididos com o usuário: apagados `vw_clientes_cobradores`
    (view) e as RPCs `clientes_do_cobrador`/`clientes_sem_cobrador`/
    `listar_cobradores` — nenhuma rastreada em migration, nenhuma chamada
    pelo front (confirmado por busca em `src/`), teriam quebrado de qualquer
    forma (`converter_valor_brasileiro(text)` em coluna agora `numeric`).
    Grant órfão do role `anon` em `banco_dados_clientes_quitados` removido ao
    recriar a view — causa raiz (`pg_default_acl` do schema `public` concede
    tudo, incluindo `anon`, a toda tabela/view nova) registrada mas **não
    corrigida** (afeta qualquer objeto novo futuro; vale sessão de segurança
    dedicada).
  - Testado em `ROLLBACK` (contagem de linhas das 2 views idêntica
    antes/depois) e depois com pagamento real em produção (cliente Ana
    Claudia Almeida Araujo, "Distribuir Pagamento" entre 2 vendas): status,
    valores e `recebimentos_historico` (audit trail) todos corretos.
- **Fase 3 (datas `text` → `date`) — concluída 2026-11-03**, commits
  `6ff4e9e` (front: `DatabaseUpload.tsx` passou a normalizar
  `data_de_recebimento` com `parseDateToISO` no fluxo de upload de status,
  mesmo padrão já usado para `data_vencimento`; `CollectionContext.tsx.updateCollection`
  passou a normalizar com `toYYYYMMDD` antes de montar o update — único
  choke point de escrita desse campo, cobre todas as telas que chamam
  `updateCollection`) e `63eee7e` (migration
  `20261103000001_banco_dados_datas_date.sql` + regeneração de
  `database.types.ts`). Levantamento (mesmo processo da fase 2:
  `information_schema.view_column_usage` + busca em `pg_proc.prosrc` +
  `pg_trigger`/`pg_policy`/`pg_constraint`/`pg_indexes` pelos 3 nomes de
  coluna) achou raio de impacto menor que a fase 2:
  - 2 views (`banco_dados_clientes_ativos`/`_quitados`, mesmo par do item 8)
    dependem das colunas — recriadas idênticas em torno do `ALTER`. Nenhuma
    view órfã esta vez (`vw_clientes_cobradores` já foi apagada na fase 2).
  - Nenhum trigger lista estas colunas em `UPDATE OF` — diferente da fase 2
    (`trg_banco_dados_atualiza_saldo` precisou ser dropado/recriado lá),
    aqui nenhum trigger bloqueou o `ALTER` por esse caminho.
  - Nenhuma policy de RLS, constraint ou índice referencia as 3 colunas.
  - Só **1 função** precisou mudar: `process_payment` declarava `v_hoje
    text := to_char(...)` e gravava em `data_de_recebimento` — confirmado em
    teste direto que Postgres **não** tem cast implícito nem de atribuição de
    `text` para `date` (o inverso, `date` → `text`, tem e funciona sem
    mudança nenhuma — é o caso dos triggers `trg_recebimentos_historico_ins`/`_upd`,
    que gravam `n.data_de_recebimento` em `recebimentos_historico.data_de_recebimento`,
    coluna `text`). Corrigido: `v_hoje date := (now() AT TIME ZONE
    'America/Sao_Paulo')::date`, sem o `to_char`. `registrar_pagamento_acordo`
    já recebia `p_data_pagamento` como `date` (sem mudança). `criar_acordo`/
    `marcar_acordos_quebrados` bateram na busca por texto por usarem
    `data_vencimento` de `acordo_parcelas` — tabela diferente, falso
    positivo. `update_client_address` só usa `data_lancamento` em `ORDER BY`,
    sem comparação de tipo.
  - Testado em transação com `ROLLBACK` contra produção antes do `db push`:
    contagem das 2 views batendo exato (74.209 + 89.400 = 163.609, igual
    antes), as 3 colunas confirmadas `date`, amostra de conversão (incluindo
    lojas "Oticas Luana \*", formato BR) correta. Depois de aplicada,
    `process_payment` testado de ponta a ponta em `ROLLBACK` contra um
    cliente real com saldo aberto: gravou `data_de_recebimento` como `date`
    de verdade, sem erro.
  - `tsc -b` e lint limpos (contagem de `DatabaseUpload.tsx`/
    `CollectionContext.tsx` idêntica ao `HEAD`: 29 problemas nos dois juntos,
    antes e depois).
  - **Efeito colateral confirmado, não é bug**: `UpdateAddressModal.tsx`
    ordena por `data_lancamento DESC` no Postgres — antes ordenava como
    texto (BR/ISO misturados), agora ordena cronologicamente de verdade.
    Achados clientes reais da Oticas Luana com datas de lançamento
    espalhadas de 2022 a 2026 onde a ordenação por string e por data
    discordam — o endereço "mais recente" pode mudar para esses casos.
  - `database.types.ts` **estava desatualizado desde a fase 1/2 desta etapa
    e a carga do Ciclone** (ainda mostrava os 11 campos de dinheiro como
    `string`, tinha `vw_clientes_cobradores`/RPCs órfãs já removidas, não
    tinha `ciclone_titulo_map`/`saldo_por_documento_tbl`/`titulo_em_acordo_ativo`)
    — regenerado contra o schema real de uma vez, pegando o atraso
    acumulado das 3 fases. As 3 colunas de data continuam `string | null`
    no tipo gerado (esperado: `date` sai como string ISO pelo PostgREST).
  - **Validado no `npm run dev` em 2026-11-03** (gestor, dados reais de
    produção, via navegador): filtro de período por lançamento em
    Atribuição de Cobradores (loja Oticas Luana Itapipoca, legada em BR,
    01/01/2024–31/12/2024 → 368 registros corretos); Acompanhamento de
    Visitas (datas/status renderizando certo); Cobranças "Em atraso" (394
    clientes/417 vendas) com uma venda aberta em detalhe — parcelas com
    `data_vencimento` de meses passados corretamente marcadas "Em atraso";
    `GeneralPaymentModal` (Distribuir Pagamento) abrindo e calculando saldo
    certo pra uma cliente da Oticas Luana; "Endereço Atual e Histórico"
    exibindo certo. **Dois pontos do checklist ficaram de fora de propósito**
    por serem escrita real em produção sem necessidade (a correção já
    estava confirmada no banco via `ROLLBACK`): não cheguei a confirmar um
    pagamento de verdade pela tela (só abri o modal), nem a clicar
    "Atualizar Endereço" num cliente sem histórico ainda (só esse caso
    aciona o ramo de arquivamento por `data_lancamento` do
    `update_client_address` — o efeito já está provado a nível de SQL, já
    que a coluna virou `date`; só não foi clicado na tela).

**Etapa 3 — as 3 fases (FK, dinheiro, datas) estão concluídas e em
produção.** Dívida técnica registrada e deixada de propósito fora do
escopo: as 6+ implementações duplicadas de parse de data BR/ISO no front
(`src/filters/dates.ts`, `utils/formatters.ts`, parsers inline em
`CollectionContext.tsx`/`DatabaseUpload.tsx`/`EnhancedPerformanceChart.tsx`/
`VisitScheduler.tsx`) continuam como estavam — todas já toleravam ISO puro
antes desta migration, então nenhuma precisou mudar, mas consolidar em uma
função única fica para uma sessão dedicada de organização, não uma correção
exigida por esta etapa.

### Importação do financeiro Ciclone — concluída em 2026-11-02

Pedido do usuário: trazer o financeiro do ERP Ciclone (contas a receber das
óticas revendedoras, empresas 1+2, filial única "Focco Brasil") para dentro
do Sistema de Cobrança como mais uma loja, com sincronização recorrente.

- Migration `20261101000001_ciclone_titulo_map.sql` (tabela técnica
  `ciclone_titulo_map`: `id_parcela` estável por `fncrt_uuid`, já que o
  Ciclone não tem esse id e ele precisa ser o mesmo entre rodadas).
- Script `Ciclone/Esquema_SQL/sync_cobranca/sync_financeiro.py`: lê
  `fn_crtitulo` (+ `fn_crtitulobaixado`/`fn_crbaixa` para data de
  recebimento), filtra `pgcln_codigo >= 100000` (abaixo disso são contas
  internas — a própria Focco Brasil, um sócio, funcionários, processadoras
  de pagamento como BLU/Cielo/Mercado Pago — **não** clientes revendedores
  reais) e `documento` com CPF/CNPJ válido. `fncrt_situacao` do Ciclone não é
  um status de pagamento confiável (títulos com saldo 0 majoritariamente
  continuam `'A'`; títulos `'F'` não têm nenhuma baixa linkada) — o status
  real vem do saldo (`valor - saldo`), só `'C'` (cancelado) é usado como está
  (zera o saldo via `desconto`, mantendo `valor_original` como fato
  histórico).
- **Carga completa aplicada em produção**: 35.632 títulos (28.606 recebidos,
  3.664 cancelados, 1.992 em atraso, 1.370 pendentes), 1.886 clientes.
  `BANCO_DADOS` foi de 127.977 → 163.609 linhas. Conferido: soma de
  `valor_original`/`valor_recebido` por status bate exatamente; `clientes`
  só preenchido nos campos vazios (nunca sobrescreve cadastro editado à mão).
- Dois bugs reais achados e corrigidos no caminho: (1) PostgREST exige
  chaves uniformes em todo POST em lote (`PGRST102`) — os patches parciais
  de `clientes` e a coluna `descricao` condicional de `BANCO_DADOS`
  quebravam isso; (2) otimização de rede: resolver `id_parcela` fazia um
  POST + GET separado (~800 requisições para 35,6 mil títulos) — trocado
  para `Prefer: return=representation`, o próprio POST já devolve o id
  (~70 requisições).
- **Efeito colateral encontrado e corrigido**: a carga expôs a causa raiz do
  item 8 (ver abaixo) antes do esperado — registrado lá.
- **Agendamento recorrente configurado em 2026-11-02**: tarefa do Windows
  Task Scheduler `Cobranca_Sync_Financeiro_Ciclone`, diária às 5h, roda
  `python sync_financeiro.py` (sincronização completa, sem `--limit`) como o
  usuário local, logon `Interactive` (funciona com a tela bloqueada, não com
  logoff), `StartWhenAvailable` (se o PC estiver hibernando no horário, roda
  ao acordar) e retry automático (2x, 10 min) em caso de falha. Testada
  manualmente no mesmo dia: 35.632 títulos, 0 novos clientes/atualizações
  (nada mudou desde a carga inicial) — confirma upsert idempotente de ponta
  a ponta. Os 32 títulos sem CPF/CNPJ válido (ignorados) são estáveis desde
  a carga original, não é regressão.
- **Correção 2026-11-06 — status `F` do Ciclone = agrupado, não recebido.**
  Pesquisa (só leitura) do agrupamento do Ciclone para a integração de
  acordos: o agrupamento é a **fatura** (`fn_crfatura` + origens em
  `fn_crfaturatitulo` + gerados em `fn_crfaturatitulogerado`), usada no
  parcelamento normal de venda. Os títulos da NF viram origem (`F`, saldo 0,
  sem baixa) e o ERP gera N títulos novos (implantação `M`, número = código
  da fatura). Renegociação no Ciclone = cancelar a fatura (gerados → `C`,
  origens voltam a `A`) e refaturar as mesmas origens. Não há trigger/função
  no banco do ERP — a lógica é do aplicativo dele. O sync classificava `F`
  pelo saldo 0 como **"recebido"**, duplicando o recebido (o pagamento real
  entra depois nos gerados). Agora: `F` com saldo 0 → status `agrupado`,
  `valor_recebido` 0, `desconto` = valor (mesma convenção do cancelado; saldo
  zera sem inventar recebimento). Dry-run: 8.607 títulos saem de "recebido".
  Front: `isAgrupado`/`isForaDaCobranca`/`seloForaDaCobranca` em
  `types/status.ts` (agrupado sai da cobrança ativa como o cancelado, selo
  "Agrupado"); `getStatusLabel`/`getStatusColor` reconhecem. Banco: nada a
  mudar (funções de saldo/atraso já ignoram título com saldo 0). A primeira
  rodada gera em `recebimentos_historico` a correção (recebido valor → 0) de
  cada um, com origem `erp_ou_manual` — registro novo, histórico preservado.
  **Ordem obrigatória:** front publicado antes da próxima rodada do sync (5h).
  O script fica fora do Git (pasta `Ciclone` não é repositório).
- **Etapa 2 (2026-11-06) — o ERP vence a trava de título em acordo.**
  Migration `20261106000001` (commit `f0c134c`, aplicada e conferida):
  `trg_protege_titulo_em_acordo` deixa passar a escrita do sync
  (`service_role` no JWT) em título que veio do Ciclone
  (`ciclone_titulo_map`). Antes, a baixa/cancelamento do ERP num título em
  acordo ativo seria recusada — título original preso no status antigo (o
  bug do Cedrus) e o sync abortando a rodada inteira no primeiro lote
  recusado. A trava segue para pagamento manual, Distribuir Pagamento,
  upload e demais lojas. Consequência aceita: pagamento de acordo registrado
  só no app sobre título Focco é sobrescrito pelo saldo do ERP na rodada
  seguinte (o ledger do acordo fica); por isso o financeiro precisa lançar no
  Ciclone.
- **Etapa 3a (2026-11-06) — renegociação do Ciclone e recebido só em
  dinheiro.** Pesquisa (só leitura) com as respostas da Márcia: no Ciclone a
  renegociação **não** é fatura. É uma **baixa com forma de pagamento 100
  "RENEGOCIAÇÃO"** (`fn_crbaixaformapagamento`, com
  `fnbfp_numeronovodocumento`): os títulos em atraso são baixados (saldo 0,
  situação continua `A`), `fn_crtitulobaixado` guarda por título
  principal/juros/multa/desconto (o mesmo que `acordo_titulos` do app), e a
  baixa gera títulos novos tipo 20 "RENEGOCIAÇÃO A RECEBER" com número = novo
  documento (parcela 1 vence no dia = entrada). Caso conferido: 14.274,66 +
  1.051,25 juros − 325,91 desconto = 15.000 = 1.000 + 28 × 500. Parcelas
  pagas ficam como estão; quebra → nova renegociação sobre os tipo 20 (437
  casos) ou SPC. O sync contava esses títulos baixados como "recebido".
  Agora o principal encerrado (`valor − saldo`) é dividido pela proporção
  das formas de cada baixa **ativa** (soma das formas = principal +
  encargos, conferido nas 7.666): forma RENEGOCIAÇÃO e DESCONTO (14) vão para
  `desconto`; só o resto é `valor_recebido`. Título encerrado só por
  renegociação vira status `renegociado` (`isForaDaCobranca` no front, selo
  "Renegociado"); se a baixa teve dinheiro (2 casos de Pix), segue
  "recebido" pela parte em dinheiro. Baixa cancelada (`fncrb_situacao='C'`)
  deixa de contar, inclusive na data de recebimento. Dry-run: recebido da
  Focco cai de R$ 29,0 mi para R$ 14,16 mi (8.611 agrupados R$ 13,28 mi;
  1.575 renegociados R$ 1,51 mi; R$ 60 mil de forma DESCONTO).
  **Pendente:** (a) outras formas não monetárias seguem contando como
  recebido — DEVOLUÇÃO (9, R$ 80 mil), TAXA DE ANTECIPAÇÃO (13, R$ 42 mil),
  formas 99/101 — decidir com o negócio; (b) baixa paga em CHEQUE/CARTÃO/BLU
  (formas 2/3/12) também gera título novo ("cheque em carteira" etc.), o
  mesmo valor pode aparecer como recebido no original e como dívida no
  título novo — investigar; (c) etapa 3b: ligar os títulos tipo 20 ao acordo
  do app (hoje entram como dívida avulsa ao lado do acordo); (d) etapa 3c:
  pacote por título (principal/juros/multa/desconto) para a Márcia lançar a
  baixa.
- **Etapa 3b, parte 1 (2026-11-06) — espelho das renegociações e
  conferência.** Migration `20261106000002`: `ciclone_renegociacoes`
  (uma linha por baixa de renegociação: novo documento, cliente, data,
  situação ativa/cancelada, valores) e `ciclone_renegociacao_titulos`
  (origens com principal/juros/multa/desconto; gerados com parcela/
  vencimento/valor), ambas só leitura para `authenticated` — só o sync grava.
  Premissas conferidas nas 319 baixas (1 documento e 1 cliente por baixa;
  gerados = empresa+cliente+número; soma = forma 100 em todas). RPC
  `acordo_lancamento_ciclone(acordo_id)` (só leitura): `fora_do_ciclone` /
  `nao_lancado` / `lancado` / `divergente` com a lista do que difere
  (títulos, quantidade/total/valor/vencimento de parcelas) e as parcelas lado
  a lado com o recebido no ERP. Sync grava depois do `BANCO_DADOS` (dry-run:
  314 renegociações, 1.681 origens, 2.265 gerados; 5 puladas por conta
  interna/sem CPF). Nada altera valor de título ou acordo. Tela: quadro
  "Lançamento no Ciclone" no `AcordoDetailModal`
  (`AcordoLancamentoCiclone.tsx`): "Ainda não lançado" (âmbar) / "Lançado —
  confere" (verde) / "Lançado com diferenças" (vermelho, com a lista e a
  comparação parcela a parcela app × Ciclone × pago no Ciclone); some para
  acordo de loja que não vem do Ciclone. `database.types.ts` regenerado do
  schema real (`supabase gen types --schema public,graphql_public` +
  prettier; único ajuste manual mantido: `p_max_dias` nulo em
  `definir_faixa_atraso_cobrador`). Achado no caminho: função nova nascia
  executável por `anon` via `PUBLIC` — corrigido na migration
  `20261106000003`. **Falta:** teste com renegociação real (as tabelas só
  enchem na rodada do sync das 5h; hoje não há acordo ativo) e a parte 2 —
  pagamento do Ciclone refletindo no acordo / quebra ciente do ERP — que
  depende das perguntas 11-13.

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

**Fase 2 — telas (levantamento em 2026-10-27, antes de mexer):**
`getCollectorPerformance` (`CollectionContext.tsx`) é **código morto** — não
é chamado por nenhuma tela (só existe no contexto/tipos). `receivedAmount`
em `CollectorPerformanceModal` e `EnhancedPerformanceChart` **já** vem de
`sale_payments` por `collector_id`/data (fato, não carteira atual) — não
tinha o bug. O progresso de meta do `CollectorDashboard`
(`getMetricsByPeriod`) também já recebe `salePayments` prontos. O bug real
estava só em `EnhancedPerformanceChart.tsx`: `clientsPaid`/
`clientsUnpaidOrPartial`/`salesPaid`/`salesUnpaidOrPartial`/
`salesTotalPeriod`/`totalAmount`/`pendingAmount` eram calculados filtrando
`collections` por `c.user_id === collector.id` (dono **atual**) dentro do
período — um título vencido em março sob o cobrador A, hoje reatribuído pro
B, contava pro B mesmo que B nunca tivesse tido esse título em março.
(`clientsPaid`/`clientsUnpaidOrPartial`/`totalAssignedClients` do card
"Carteira Atual" são deliberadamente um retrato de HOJE, não do período —
ficaram como estavam, de propósito.)

**Corrigido em 2026-10-27** (migration `20261027000002`, versão simples
decidida com o usuário: dono na data de vencimento do título, ou lançamento
se só essa bateu no período — não o momento exato da quitação, que exigiria
`recebimentos_historico`; essa versão mais precisa fica anotada pra depois
se a simples não for suficiente):
- Função `cobrador_na_data_em_lote(p_pares jsonb)`: dado um lote de pares
  `{documento, data}`, devolve quem era o dono da carteira
  (`atribuicoes_historico`) naquela data — testada no banco (leitura): ~280ms
  para 3.000 pares (um mês inteiro de títulos tem tipicamente ~1.800-2.000
  pares únicos).
- `EnhancedPerformanceChart.tsx`: um `useEffect` novo junta os pares únicos
  (documento + data de referência) de todos os títulos do período filtrado,
  chama a função em lote, e o `filteredCollections` por cobrador passa a
  comparar contra esse dono histórico em vez de `c.user_id`. Enquanto a
  resposta não chega (ou falta algum par), cai pro dono atual — nunca pior
  que o comportamento anterior, só corrige assim que a resposta chega.
- `tsc -b` limpo; lint sem aumentar a contagem (`EnhancedPerformanceChart.tsx`:
  1 erro pré-existente, igual antes).
- **Ainda não testado no `npm run dev` nem commitado.**

**Ainda em aberto (não faz parte desta correção):**
- Tela "Baixas do ERP" a partir de `recebimentos_historico`.
- A origem `erp_ou_manual` não distingue a planilha da edição manual na
  parcela. Para separar, a importação precisa passar por uma RPC.
- Versão com o momento exato da quitação (via `recebimentos_historico`), se
  a atribuição por data de vencimento/lançamento não for precisa o
  suficiente na prática.

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
- **Passo 4 (remover `users.password`), 2026-11-06**: tinha ficado pendente.
  Achado ao provisionar 4 usuários novos: 15 dos 19 usuários ainda tinham a
  senha em texto puro na coluna (a mesma do login atual) e a política
  `authenticated_full_access` deixava qualquer logado ler. Migration
  `20261106000005_remove_users_password.sql` (`drop column`, aplicada e conferida 2026-11-06); nenhuma função
  ou view dependia dela (conferido via Management API). Tipos ajustados e
  `scripts/migrate-users-to-auth.mjs` marcado obsoleto (sai com erro).
  Usuário novo: criar conta no Auth à mão e preencher
  `auth_user_id`/`auth_email` (SQL usado em 2026-11-06 para Jonathan,
  Vanessa, Aline Freitas e Aline, senha inicial comum — trocar depois).

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

~~`rescheduleVisit` (`CollectionContext.tsx` ~3900–4130) fazia 3+ escritas
separadas do navegador (checa conflito → marca a original como `reagendada`
com UPDATE condicional → insere a nova → grava `rescheduled_to_id`), com
reversão "best-effort" se o INSERT falhasse depois do UPDATE. Se caísse no
meio, a cadeia ficava quebrada. Em 2026-10-02 havia **2.106 visitas
`reagendada` sem `rescheduled_to_id`** — a maioria provavelmente anterior à
migration `20260601000001_add_reschedule_link_ids` (não verificado).~~

**Corrigido em 2026-10-30** (migration `20261030000003`): função
`reagendar_visita(p_visit_id, p_nova_data, p_novo_horario, p_motivo_chave,
p_notas_original, p_notas_nova)` — `SELECT ... FOR UPDATE` trava a linha
(substitui o UPDATE condicional que fazia esse papel no front), checa
conflito de data, autorização (dono da visita ou gestor — repete a regra da
policy `dono_ou_gestor`, já que `SECURITY DEFINER` contorna a RLS) e faz as
3 escritas (UPDATE original + INSERT nova + vínculo) numa transação só.
`rescheduleVisit` no front monta os textos das notas (igual a antes,
`config/rescheduleReasons.ts` continua sendo a única fonte do rótulo do
motivo) e só repassa pra função. Testado no banco em transação com
`ROLLBACK` (nada gravado): reagendamento normal, tentativa de reagendar a
mesma visita duas vezes (já "reagendada") e conflito de data — as 3
situações se comportaram como esperado. `tsc -b` limpo; lint sem aumentar
(`CollectionContext.tsx`: 18→18). Testado no `npm run dev` em 2026-10-30
(usuário): reagendamento normal confirmado no banco (UPDATE da original +
INSERT da nova + vínculo, tudo na mesma transação). O teste de "conflito"
pela tela não é alcançável — `VisitScheduler.tsx` (`baseFilteredClients`)
já esconde do modal de agendamento qualquer cliente com visita
`status = "agendada"`, então nunca existem duas visitas ativas do mesmo
cliente ao mesmo tempo para colidir; o checável na função é rede de
segurança contra o índice único do banco (`uniq_active_visit_per_client_date`)
e corridas diretas na API, só alcançável em transação manual (já validado
antes do push). **Migration aplicada em produção (`db push` do usuário,
2026-10-30, confirmada no banco via Management API).**

**Lacuna encontrada no teste e corrigida na sequência (migration
`20261030000004`):** o índice único que sustentava a checagem de conflito
(`uniq_active_visit_per_client_date`) só cobria mesmo cobrador + mesma data —
mais fraco que a regra real do app ("no máximo 1 visita ativa por cliente,
qualquer data, qualquer cobrador", já aplicada no modal de agendamento por
`VisitScheduler.tsx`/`baseFilteredClients`). A lacuna permitia duplicata
entre cobradores diferentes quando a carteira é reatribuída com
`transferVisits=false` (`BulkAssignmentModal`): o agendamento antigo fica
com o cobrador anterior, e o cliente aparece "livre" no modal do novo
cobrador. **5 clientes já tinham duplicata ativa em produção** (mesmo
cobrador, datas diferentes — padrão compatível com a fila offline).
Corrigido: índice trocado para `UNIQUE (client_document) WHERE status =
'agendada'` (sem data, sem cobrador); duplicatas existentes resolvidas com a
mesma estratégia não destrutiva da migration `20260601000002` (mantém a mais
recente por `created_at`, marca as demais como `cancelada` com nota de
auditoria); checagem de conflito de `reagendar_visita` ampliada para a mesma
granularidade. Testado em transação com `ROLLBACK`: limpeza resolveu
exatamente os 5 clientes esperados, índice novo criou sem erro, tentativa de
duplicata entre cobradores diferentes rejeitada pelo banco, reagendamento
normal continua funcionando. **Aplicado em produção** (`db push` do
usuário, confirmado via Management API: índice `uniq_active_visit_per_client`
existe como definido e as 5 duplicatas esperadas foram marcadas
`cancelada` com a nota de auditoria da migration nova — as outras 22
`cancelada` com nota parecida vêm da migration antiga `20260601000002`,
texto diferente).

Achado mas **fora de escopo por ora** (fica pra quando alguém tocar em
`scheduleVisit`): o caminho de "agendar visita nova" (`CollectionContext.tsx`,
`scheduleVisit`) não traduz o erro do índice único pra uma mensagem amigável
como `reagendar_visita` faz — mostra o texto crú do Postgres
(`duplicate key value violates unique constraint...`) se algum dia essa
colisão acontecer por aí (hoje improvável: o modal já esconde quem tem visita
ativa).

**Piloto do `refreshData()` catch-all (2026-10-30):** usuário reportou que
reagendar pelo modal de "Visitas Atrasadas" mostra a tela cheia
"Atualizando dados..." — o mesmo achado já registrado antes (ver memória,
achado em 2026-10-27, estacionado a pedido do usuário). `handleConfirmReschedule`
(`VisitScheduler.tsx`, handler único usado tanto pelo modal normal quanto
pelo de atrasadas — os dois abrem o mesmo modal de reagendamento) chamava
`await refreshData()` depois do `rescheduleVisit`, que já atualiza
`scheduledVisits` no estado local a partir da linha real devolvida pela RPC
`reagendar_visita` (item 2) e só toca na tabela `scheduled_visits` — nada em
collections/users/payments/metas pode ter mudado. **Corrigido:** removida a
chamada de `refreshData()` nesse ponto (sem substituir por nada — não havia
nada a buscar de novo). De caminho, o `catch` passou a mostrar
`error.message` em vez do texto genérico fixo, pra aproveitar as mensagens
amigáveis que `reagendar_visita` já devolve (conflito, visita já reagendada
por outra operação etc.). `tsc -b` limpo; lint do arquivo sem aumentar
(21→21). Só este ponto foi tocado — os outros ~10 lugares que chamam
`refreshData()` depois de outras mutações (registrar/cancelar visita,
atribuição de cobrador) continuam como estavam; ver memória de estado pra
decidir se valem o mesmo tratamento depois.

**Testado em produção em 2026-10-30** (cobrador Francisco, cliente Zildete
Fernandes Oliveira de Brito, pelo modal "Visitas Atrasadas"): "Visita
reagendada com sucesso!", lista atualizou na hora (8→7 atrasadas) sem a
tela cheia "Atualizando dados...". Commitado.

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
~~**A causa raiz (paginação por `OFFSET`) não foi eliminada, só reduzida
  pela metade.**~~ **Corrigido em 2026-11-02**, forçado pela carga do
  financeiro Ciclone (+35.632 linhas, `BANCO_DADOS` 127.977 → 163.609):
  reproduziu em produção, sem nenhuma escrita concorrente, exatamente o que
  este item previa — `banco_dados_clientes_ativos` levou **54,3s** para
  74.345 linhas, e `banco_dados_clientes_quitados` deu `57014` (statement
  timeout) em `offset=10000`/`offset=12000`, bem mais superficial que os
  `offset=60000+` de antes.

  **Diagnóstico mais preciso do que "é o `OFFSET`"**: `EXPLAIN ANALYZE` ao
  vivo mostrou que **79% do custo por página era o `HashAggregate`** de
  `saldo_por_documento` (migration `20261030000001`) — essa view recalculava
  `SUM(...) GROUP BY documento` sobre as 163 mil linhas **do zero, em toda
  página pedida**, não só na profundidade. O `OFFSET` era só os ~21%
  restantes.

  **Correção (migration `20261102000001_materializa_saldo_por_documento.sql`)**:
  1. `saldo_por_documento` deixou de ser view e passou a ser tabela
     (`saldo_por_documento_tbl`) mantida por gatilho `AFTER INSERT OR UPDATE
     ON "BANCO_DADOS"`, que recalcula **só o documento afetado** (indexado
     por `idx_banco_dados_documento`) — não é o anti-padrão "saldo
     decrementado" da skill `arquiteto-cobranca`: o gatilho sempre recalcula
     a soma do zero, nunca faz `saldo = saldo - pago`, só move esse
     recálculo de "toda leitura, tabela inteira" para "toda escrita, 1
     documento". `banco_dados_clientes_ativos`/`_quitados` e
     `cliente_tem_saldo_aberto` continuam lendo pelo mesmo nome
     (`CREATE OR REPLACE VIEW` preserva as views dependentes), sem mudar
     uma linha de SQL nelas.
  2. **Agora sim**, paginação por keyset: `fetchAllPagesByIdRange`
     (`src/utils/supabasePagination.ts`) troca `OFFSET` por faixas de
     `id_parcela` (index range scan via `BANCO_DADOS_pkey`, custo
     independente da profundidade) nos 3 pontos de `CollectionContext.tsx`
     que usavam `fetchAllPages`/`fetchPagesInParallel` (escopos
     `active`/`all`/`quitados`). Bônus: elimina a instabilidade do `OFFSET`
     sob escrita concorrente (uma linha pertence a exatamente uma faixa pelo
     próprio id) — os 3 pontos não precisam mais de `dedupeBy`.
  - Testado em transação com `ROLLBACK` contra produção antes do `db push`:
    zero divergência entre a fórmula antiga e a tabela nova nos 16.728
    documentos; gatilho testado em `UPDATE` (pagamento parcial/total),
    `INSERT` (cliente novo) e no caso-limite (todos os títulos do documento
    cancelados → saldo zera, não fica obsoleto).
  - **Medido em produção depois do `db push`**: a página que antes dava
    `57014` responde em **108–172ms** (REST, service role, fora do
    navegador). `tsc -b` limpo; lint de `CollectionContext.tsx` idêntico ao
    `HEAD` (18 problemas antes e depois, nenhum novo); `supabasePagination.ts`
    sem problema, antes e depois.
  - Projeto no plano gratuito do Supabase (compute compartilhado, sem
    `pg_cron`) — por isso a correção foi algorítmica (parar de recalcular),
    não "banco mais forte" nem refresh periódico por job agendado.
- Modais de detalhe (cobrador/loja/cliente): hoje ainda leem tudo via
  `collections` em memória; poderiam virar fetch sob demanda filtrado
  (`WHERE user_id=X` etc.), só quando o gestor clica — ganho pequeno agora
  que o Passo 2 já evita a tabela inteira, fica pra se o keyset não bastar.
- **Ideia anotada pelo usuário em 2026-10-27, não avaliada ainda:** filtrar
  por padrão o mês atual em tudo (não só carregar menos linhas, mudar o
  que cada painel pede), e os totais agregados (dívida total, contagem de
  clientes, etc.) passarem a ser calculados no banco (função/`GROUP BY`)
  em vez de somados em JS sobre `collections` carregado por inteiro. Evita
  a consulta longa na raiz, mas é o tipo de `GROUP BY` por tela que a
  skill `arquiteto-cobranca` pede pra evitar (duplica a lógica do
  `FilterBar` em SQL) — por isso não foi feito junto com o Passo 2.
  Avaliar junto com a decisão de keyset acima antes de implementar.

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

## Nova tela: Resumo por Cobrador

Aba nova do gestor ("Resumo", `src/components/dashboard/CollectorsSummary.tsx`)
— dashboard agregado por cobrador (cards ou tabela), com filtro de período e
de cobrador. Puramente aditiva: não substitui nenhuma tela existente, só lê
`collections`/`scheduledVisits`/`salePayments`/`users` do `CollectionContext`
(nenhuma migration, nenhuma mudança de banco). Fiada em `ManagerDashboard.tsx`
e `config/navigation.ts` (id `collectors-summary`, precisa de escopo
completo — já incluída em `TABS_NEEDING_FULL_SCOPE`).

Atende aos itens 56 ("indicadores de carteira vencida, a receber e prevista,
com filtro de data flexível por cobrador") e 58 ("consolidar o
acompanhamento por cobrador") do cronograma da reunião de 28/10/2026
(`cronograma_acoes.csv`, Agente_CEO_Grupo_FV). O pedido original era alterar
a tela Acompanhamento existente; decisão do Erick foi entregar como aba nova
em vez disso. Marcado `concluido` na planilha em 2026-10-30.

**Estado em 2026-10-30, fim da sessão:** `tsc -b` limpo; lint do arquivo
limpo (arquivo novo, sem baseline pra comparar). **Nada commitado ainda**
(`git status`: `CollectorsSummary.tsx` novo/untracked,
`ManagerDashboard.tsx`/`navigation.ts` modificados). Testada visualmente
pelo usuário ao longo da sessão (várias rodadas de ajuste fino), mas sem uma
passada final de "pronto pra commitar".

**Bug real corrigido no caminho:** a tela comparava `data_vencimento` como
string crua contra `today`/`dateFrom`/`dateTo` pra classificar "vencida"/
"prevista" — mas essa coluna de `BANCO_DADOS` tem ~29% das linhas em
`DD/MM/YYYY` misturado com `YYYY-MM-DD` (ver `filters/dates.ts`). Corrigido
reusando `toYYYYMMDD` (normalização, mesma de `ClientAssignment`) pra
comparar com o período e `calculateOverdueDays` (mesma fonte de
`CollectorDashboard`/`CollectionContext`/`EnhancedStoreManagement`) pra
"vencida".

**Decisões de design fechadas nesta sessão (a pedido do usuário, várias
rodadas de revisão visual):**
- Filtro de cobrador guarda os **excluídos**, não os selecionados — um
  conjunto vazio sempre significa "todos" e um cheio significa "nenhum",
  sem a ambiguidade que "selecionados vazio = todos" teria. Botão
  "Selecionar todos"/"Desmarcar todos" alterna entre os dois extremos.
- **Financeiro** (parcelas de `BANCO_DADOS`) e **Agenda** (`scheduledVisits`)
  são domínios independentes (uma parcela pode vencer sem visita marcada, e
  vice-versa) — a tela marca essa separação com um tom cinza claro/escuro,
  mas **só nas células de título** (cabeçalho da tabela, rótulo da "Visão
  geral"), nunca no conteúdo/corpo — tirado de lá a pedido explícito do
  usuário depois de testar.
- Tabela: colunas ordenáveis (clique no título ordena asc/desc, seta indica
  a coluna ativa); coluna `#` de rank; Cards e Tabela compartilham o mesmo
  estado de ordenação.
- Vista padrão (sem preferência salva) é **Tabela**, não Cards — melhor pra
  comparar/rankear muitos cobradores (a lista já vem ordenada).
- "Visão geral" (soma agregada) é colapsável por um botão no próprio
  cabeçalho (sempre presente, funciona igual com 1 ou vários cobradores) —
  só o padrão muda: começa fechada na transição pra exatamente 1 cobrador no
  filtro (os totais ficariam idênticos ao card/linha única), mas o usuário
  pode abrir/fechar manualmente em qualquer contagem depois.
- Com 1 cobrador só no filtro, o card ocupa a largura total no modo Cards
  (antes ficava espremido num terço da tela, sobrando grid vazio ao lado).
- Texto explicativo (situação atual vs. período; Financeiro vs. Agenda) saiu
  de um banner azul fixo e virou um ícone "ⓘ" com popover ao lado do título.
- Renomeado "Prevista" → "Vence no período" (menos ambíguo em relação às
  métricas de agenda).

**Testado em 2026-10-30** (via browser, dado real): filtro de cobrador por
exclusão, popover, colapso automático da Visão Geral ao cair pra 1
cobrador (reabre manual), card de largura total com 1 cobrador, tabela com
rank/ordenação batendo com os totais — tudo certo, sem erro novo no
console. Commitado.

## Acordo de renegociação (Interno/Terceirizado/Jurídico) — concluído 2026-10-31 (commit `8966889`)

Pedido do usuário em 2026-10-30, fora do cronograma da reunião de 28/10:
melhorar a interface dos perfis "carteira" (Interno/Terceirizado/Jurídico =
SPC — **não** o Cobrador Externo, que trabalha por rota/visita e tem lógica
diferente) pra cobrir o que o Cedrus (sistema antigo) faz hoje: ligar pro
cliente e negociar/parcelar a dívida. Prints do Cedrus (`01.jpeg`/`02.jpeg`
na raiz do projeto, só referência de fluxo — não commitados) mostraram uma
tela "Negociações" (lista/filtro de acordos por devedor/status) e um fluxo
de "Contato Receptivo" com "Realizar Contato / Negociação".

**Achado no caminho:** o registro de ligação atual (`LogContactModal.tsx`,
botão "Registrar Interação") grava o resultado como uma visita falsa em
`scheduled_visits` (`status: "realizada"`) em vez de usar a tabela certa
que já existe pra isso (`collection_attempts`, usada por outro componente,
`CollectionModal.tsx`/`addAttempt`) — dois mecanismos de registrar contato
coexistindo. Recomendei corrigir isso primeiro (escopo pequeno, bug real) e
deixar "acordo" pra quando desse pra modelar com calma; o usuário decidiu
seguir direto para o acordo completo. **`LogContactModal` não foi tocado
nesta sessão — continua gravando a visita falsa.**

**Modelagem (skill `arquiteto-cobranca`), decidida com o usuário:**
- Quebra automática do acordo: **15 dias** de atraso numa parcela sem
  quitar. Sem `pg_cron` configurado neste projeto — checado pelo front uma
  vez por sessão (`marcar_acordos_quebrados()`, chamada não-bloqueante
  depois da carga inicial em `CollectionContext.tsx`). Se a sessão for
  aberta raramente, a quebra demora a refletir; migrar pra `pg_cron` se
  isso incomodar na prática.
- Criar acordo trava `BANCO_DADOS.situacao` do cliente em **"Em acordo"**
  (nova situação, só nos 3 perfis carteira) até o acordo resolver
  (cumprido/cancelado/quebrado). A trava é um trigger `BEFORE UPDATE` em
  `BANCO_DADOS` (`trg_protege_situacao_acordo`) — não só checagem no
  front, porque a importação da planilha do ERP (`DatabaseUpload.tsx`) faz
  `UPDATE` direto do navegador, fora de qualquer RPC.
- Reatribuição de carteira **bloqueada** enquanto o acordo está ativo:
  `atribuir_clientes_em_lote`/`remover_cobrador_em_lote`/
  `liberar_cliente_da_carteira` passam a pular (`WHERE NOT
  cliente_tem_acordo_ativo(...)`) quem tem acordo ativo.
- Datas de parcela livres (sem restrição tipo `allowed_visit_dates`) — bom
  o bastante pro primeiro corte.

**Schema novo** (migration `20261030000005_criar_acordos_renegociacao.sql`,
aplicada em produção):
- `acordos`: termos originais imutáveis (`valor_negociado`,
  `numero_parcelas`); `status` (`ativo`/`cumprido`/`cancelado`/`quebrado`)
  é o único campo de ciclo de vida que muda, nunca reaberto — renegociar é
  sempre um acordo novo (`acordo_origem_id` encadeia, coluna existe mas
  fluxo de renegociação em si não foi implementado nesta fatia). Índice
  único `uniq_acordo_ativo_por_cliente`: no máximo 1 acordo ativo por
  cliente (mesmo princípio de "1 visita ativa por cliente", migration
  20261030000004).
- `acordo_titulos`: N:N com `BANCO_DADOS` (títulos consolidados no
  acordo), com `saldo_no_momento` capturado na criação (fato histórico de
  auditoria).
- `acordo_parcelas`: parcelas futuras combinadas, imutáveis. **Sem coluna
  de status "paga/atrasada"** — é projeção do ledger de pagamentos, mesma
  lição já aplicada em `BANCO_DADOS` (item 1c: não duplicar "situação da
  dívida" numa coluna que alguma tela atualiza por conta própria).
- `acordo_pagamentos`: ledger append-only, espelha exatamente a convenção
  de `sale_payments` (pagamento positivo, estorno é registro novo com
  valor negativo + `estorno_de` apontando pro original — nunca
  `UPDATE`/`DELETE`).
- RPCs: `criar_acordo` (acordo + títulos + parcelas numa transação),
  `registrar_pagamento_acordo` (marca `cumprido` automático quando todas
  as parcelas quitam), `cancelar_acordo` (motivo obrigatório),
  `marcar_acordos_quebrados` (varredura dos 15 dias). Funções auxiliares
  `cliente_tem_acordo_ativo`/`situacao_primaria_do_tipo`/
  `saldo_acordo_parcela`.

**Front:** tipos novos (`Acordo`/`AcordoTitulo`/`AcordoParcela`/
`AcordoPagamento` em `types/index.ts`), funções no `CollectionContext`
(`criarAcordo`/`fetchAcordoDetalhe`/`registrarPagamentoAcordo`/
`cancelarAcordo`/`getAcordoAtivoDoCliente`), dois componentes novos em
`components/dashboard/`: `AcordoModal.tsx` (criação — escolhe títulos em
aberto, gera/edita parcelas) e `AcordoDetailModal.tsx` (acompanhar
parcelas, registrar pagamento, cancelar). Botão "Negociar" novo na tabela
de `InternalCollectorWallet` (dentro de `CollectorDashboard.tsx`), com
badge "Em acordo" quando o cliente já tem um ativo. `config/profiles.ts`
ganhou `SITUACAO_EM_ACORDO`/`WALLET_COLLECTOR_TYPES` e `ALL_SITUACOES`
passou a deduplicar (sem isso "Em acordo", presente nos 3 perfis carteira,
apareceria 3x nos dropdowns de `AddTituloModal`/`BulkAssignmentModal`).

`tsc -b` limpo; lint de cada arquivo tocado sem aumentar a contagem
(`CollectorDashboard.tsx` 19→19, `CollectionContext.tsx` 10→10,
`types/index.ts` 3→3, `profiles.ts` e os 2 arquivos novos limpos).

**Testado em produção em 2026-10-31** com clientes reais (criar acordo →
pagamento parcial → pagamento total → `cumprido` automático; e criar
acordo → pagamento parcial → cancelar com motivo): fluxo completo
funcionando. No caminho, quatro bugs reais foram achados e corrigidos (todos
testados ao vivo depois do fix):

- **Pagamento do acordo não refletia no saldo do título original.**
  `registrar_pagamento_acordo` só gravava no ledger próprio do acordo
  (`acordo_pagamentos`); `BANCO_DADOS.valor_recebido` nunca mudava, então
  tudo que lê saldo direto da tabela (`saldo_por_documento`,
  `cliente_tem_saldo_aberto`, `hasOpenBalance`/`getClientPending` no front)
  continuava mostrando o cliente como devendo o valor cheio depois de ele
  quitar o acordo inteiro. Corrigido distribuindo o pagamento nos títulos
  originais consolidados (mais antigo primeiro), mesma mecânica que
  `process_payment` já usa pro pagamento normal — migration
  `20261031000001_acordo_distribui_pagamento_nos_titulos.sql`. Efeito
  colateral correto: o pagamento via acordo passa a contar pro Desempenho
  do cobrador também, mesmo campo que já credita lá. Gap conhecido: acordos
  pagos **antes** desta migration não são corrigidos retroativamente.
- **Carteira do cobrador não atualizava sozinha** (precisava de F5 depois
  de uma atribuição, pagamento ou criação de acordo). `useMemo`s em
  `CollectorDashboard.tsx` (`myCollections`/`filteredCollections`/
  `clientGroups`/`myVisits`/`periodMetrics`) tinham `[user?.id]` como
  dependência, sem as funções (`getClientGroups` etc.) que o eslint já
  apontava como faltando — ficavam presos no resultado calculado na
  primeira vez até o `user?.id` mudar (ex.: relogin). Corrigido incluindo
  as funções nas dependências.
- **`requestCollections()` com race condition.** Reentrância travada só
  por um `ref` booleano: uma segunda chamada enquanto a primeira ainda
  carregava (comum no login do gestor, via `ensureSettledCollections`)
  recebia uma Promise já resolvida sem esperar a carga real terminar —
  quem fazia `await requestCollections()` seguia adiante com
  `allCollections` parcial. Corrigido guardando e devolvendo a mesma
  Promise em voo pra qualquer chamador concorrente.
- **`AcordoDetailModal` usava `window.prompt()`** pro motivo do
  cancelamento — trava a aba inteira enquanto o dialog nativo está aberto
  (achado na prática: travou a automação do teste). Trocado por campo de
  texto dentro do próprio modal.

Também um ajuste de UX a pedido do usuário: o dropdown "Status das
Parcelas" do `BulkAssignmentModal` agora mostra só as situações do perfil
do cobrador selecionado (`SITUACAO_BY_PROFILE`), em vez de todas —
minimiza erro de atribuir um status fora do domínio do cobrador de
destino.

**Achado e corrigido em 2026-10-31 (ver seção "Pendências do acordo
fechadas" abaixo):** `AcordoModal.tsx` mostrava "venc. Invalid Date" pra
títulos de alguns clientes.

**`LogContactModal` corrigido** (ver seção abaixo) — não grava mais
visita falsa.

**Pendências do acordo fechadas em 2026-10-31 (commits `6dc5b83`/
`d4a94be`/`589da98`, `tsc -b` limpo em cada etapa, lint sem aumentar a
contagem):**

1. **`database.types.ts` regenerado** contra o schema real (nunca tinha
   sido desde que foi escrito à mão). Revelou 2 problemas no arquivo
   manual: `recebimentos_historico.origem` estava com union literal
   inventado (`"app" | "erp_ou_manual" | "foto_inicial"`) quando a coluna
   real é `text` livre — `ClientHistoryViewer.tsx` ganhou fallback pra
   valor fora dos 3 conhecidos; e vários parâmetros opcionais de RPC
   (`reagendar_visita`, `registrar_pagamento_acordo`) são `string |
   undefined`, não `string | null` — `CollectionContext.tsx` ajustado.
   De quebra, `cancelarVendas`/`cancelarClientes` ganharam guarda de
   usuário autenticado antes do RPC (`p_usuario_id` é obrigatório, sem
   default — antes passava `user?.id` possivelmente `undefined`).
2. **"venc. Invalid Date" no `AcordoModal.tsx` corrigido.**
   `data_vencimento` é `text` livre em `BANCO_DADOS` (~29% das linhas em
   `DD/MM/YYYY`, resto `YYYY-MM-DD` — comentário em
   `CollectorsSummary.tsx`); o modal fazia `new Date(vencimento +
   "T00:00:00")`, que só funciona pro formato ISO. Trocado pelo
   `formatDate()` de `utils/formatters`, já usado em todo o resto do app
   pra essa mesma coluna.
3. **`LogContactModal.tsx` ("Registrar Interação") não grava mais visita
   falsa em `scheduled_visits`.** Passa a inserir em
   `collection_attempts` — uma linha por título em aberto do cliente
   (mesma lista que `AcordoModal` usa via `hasInstallmentBalance`),
   bloqueando com aviso se não houver título aberto; é assim que a aba
   "Tentativas" de cada título no `CollectionModal` já funciona (decisão
   confirmada com o usuário: o contato precisa aparecer em todos os
   títulos pendentes, não só no mais antigo). `CollectionAttempt["result"]`
   (`types/index.ts`) ganhou `contact_made`/`message_sent` pros 2 motivos
   do modal que não existiam no vocabulário original (criado pro
   `CollectionModal`, que só cobre ligação/visita de título único) —
   `ATTEMPT_RESULT_LABELS` do `CollectionModal` atualizado junto.

**Ainda pendente:** `database.types.ts` precisa virar passo de rotina
depois de migration nova (não há script/CI que force isso — ficou 1 mês
desalinhado sem ninguém notar porque só gera erro de tipo quando a coluna
realmente diverge do que foi escrito à mão).

**Polimento de UI na carteira do cobrador, feedback do usuário depois do
teste (commits `0150444`/`d7cf137`/`34a53a1`, `tsc -b`/lint sem aumentar
a contagem em cada um):**
- Removidos os dois últimos `alert()` nativos de `CollectorDashboard.tsx`
  (copiar documento e WhatsApp sem telefone) — mesmo motivo do
  `window.prompt` do cancelamento de acordo, ver
  [[feedback-sem-dialogs-nativos]]: copiar ganhou feedback visual (ícone
  fica verde ~1,5s) e o botão de WhatsApp fica desabilitado com `title`
  em vez de alertar.
- Botão de copiar documento saiu da coluna "Ações" (redundante — usuário:
  "acho inútil esse botão") e virou um ícone pequeno ao lado do próprio
  CPF/CNPJ.
- Ícone do botão de WhatsApp trocado do raio (`Zap`, genérico, lucide não
  tem logos de marca) por um SVG inline do glifo do WhatsApp — sem nova
  dependência só por causa de um ícone.

## Redesenho da carteira do cobrador (Interno/Terceirizado/Jurídico) — Fase 1 concluída 2026-10-31 (commits `cfb7778`…`62fef28`)

Pedido do usuário: revisão completa da tela de carteira pensando na
rotina real do cobrador (saber rápido quem ligar, promessas vencendo,
reduzir cliques) + um sistema de metas novo. Decidido com o usuário:
**Fase 1 = só a tela** (este bloco); metas fica pra Fase 2, fora desta
sessão — exige schema novo (`collection_attempts` não tem coluna de quem
fez o contato) e telas de gestor, mais seguro planejar depois de ver a
tela nova em uso. Metas coletivas/comissão de gestor por cobrador com
meta batida: fora de escopo também, mencionado pelo usuário mas adiado
("é simples, mas é bom deixar pra depois").

Levantamento antes de desenhar (dois agentes de exploração) achou: a
barra de progresso de "Recuperação do Mês" já usa `monthly_goals` com
fallback fixo de R$100mil quando não há meta cadastrada (não mexido,
fica pra Fase 2); já existe um modal de criar/editar meta
(`MonthlyGoalEditModal.tsx`, 566 linhas) mas enterrado dentro de
"Desempenho"; `EnhancedPerformanceChart.tsx` já segmenta cobrador
acima/abaixo da meta — embrião do "visão gerencial" da Fase 2.

**Plano formal:** `docs/plans/logical-soaring-sunset.md` (no histórico de
planos do Claude Code, não versionado no repo).

**As 6 etapas, cada uma commitada e testada ao vivo separadamente:**
1. `src/filters/priority.ts` (novo) + `clientMaxOverdueDays` em
   `clientStatus.ts`: os limiares de atraso 90/60/30 dias estavam escritos
   a mão em 3 lugares de `CollectorDashboard.tsx`, e o loop de "maior
   atraso do cliente" duplicado 2x. Refactor puro, badges idênticos antes
   e depois.
2. `attemptsByCollection`/`lastContacts` passaram a carregar
   `next_action_date` (gravado pelo `LogContactModal` numa promessa de
   pagamento, nunca lido em lugar nenhum antes) — mesmo fetch em lote já
   existente, sem query nova.
3. **"Fila de Atendimento" virou agenda priorizada por seções**, cada
   cliente numa só (maior precedência primeiro): Promessas vencendo
   hoje/atrasadas > Acordo quebrado (`getAcordoQuebradoDoCliente`, novo,
   paralelo a `getAcordoAtivoDoCliente`) > Crítico 90+ dias > Sem contato
   há 7+ dias (`SEM_CONTATO_DIAS`, `config/collectionAttempts.ts`) > Resto
   da carteira. Dropdowns "Todos os Atrasos"/"Todos os Status" saíram
   (decidido com o usuário) — Crítico virou seção própria, resto só com
   busca + cidade. Linha extraída em `ClientQueueRow` reusável.
4. Histórico de contatos: `ATTEMPT_TYPE_LABELS`/`ATTEMPT_RESULT_LABELS`
   saíram de dentro do `CollectionModal.tsx` pra
   `config/collectionAttempts.ts`; novo bloco na aba "Dados" do
   `ClientDetailModal` mostra **todos** os `collection_attempts` do
   cliente (todos os títulos, não só em aberto) — nunca existiu essa
   visão agregada antes, só o último contato truncado na linha da agenda.
5. Botão "Ligar" (`tel:`) — não existia em lugar nenhum da tela. Linha da
   agenda (ao lado do WhatsApp) e aba Dados (um botão por número).
6. `AcordoModal.tsx`: parcelas geradas automaticamente a partir do saldo
   selecionado (sem botão manual "Gerar parcelas"); se o usuário editou à
   mão e muda a seleção/número de parcelas depois, mostra aviso inline em
   vez de descartar silenciosamente; "Total combinado" fica vermelho ao
   vivo quando não bate com o saldo, `handleSubmit` bloqueia o envio no
   mesmo caso.

`tsc -b` limpo a cada etapa; lint de cada arquivo tocado sem aumentar a
contagem (`CollectorDashboard.tsx` 22→17 — melhorou, removeu `any`s
junto). Testado ao vivo logado como cobrador Terceirizado (cliente de
teste João Siriano Soares): cliente sem contato caiu em "Crítico";
registrar promessa de pagamento moveu pra "Promessas vencendo" (seção de
maior precedência) e "Crítico" sumiu (seção vazia não renderiza);
histórico de contatos mostrou a venda correta; desmarcar um título no
`AcordoModal` recalculou as parcelas e mostrou o aviso. Dados de teste
removidos do banco depois de cada verificação.

**Ainda pendente (Fase 2, fora desta sessão):** sistema de metas —
schema por perfil/critério, migration adicionando `collector_id` em
`collection_attempts` (hoje não dá pra atribuir "contato feito" a um
cobrador), telas de criar/editar meta acessíveis, painel individual do
cobrador, painel comparativo do gestor. Meta coletiva/comissão por
cobrador com meta batida: mencionado pelo usuário, adiado.

## Metas mensais + vínculo gerente↔cobrador + carteira automática por faixa de atraso — análise 2026-11-03

Pedido do usuário: três features sobre a base do redesenho de carteira
acima — (1) metas mensais cobrador/gerente, (2) vínculo gerente↔cobrador
com histórico (bonificação do gerente pelos resultados da equipe), (3)
saída/redistribuição automática de cliente da carteira quando ultrapassa
a faixa de atraso do cobrador + seção "Clientes urgentes" + consolidação
no painel do gerente. Pedido explícito: analisar antes de implementar.

**Levantamento confirmou que boa parte já existe:**
atribuição cliente↔cobrador (`BANCO_DADOS.user_id`, aplicada por
cliente/`documento` via `atribuir_clientes_em_lote`) já tem auditoria
append-only (`atribuicoes_historico`, trigger, com `motivo`+`gerente_id`);
guard `cliente_tem_acordo_ativo` já trava reatribuição/remoção de cliente
com acordo ativo; atraso financeiro por cliente já tem fonte única
(`clientMaxOverdueDays` em `src/filters/clientStatus.ts`, usado por
`priority.ts` desde a Fase 1); `sale_payments`/`acordo_pagamentos` já
guardam `collector_id` próprio do pagamento (não o dono atual da
carteira) — resolve sozinho "cliente mudou de cobrador no meio do mês"
para fins de meta. `users` não tem `manager_id` nem hierarquia — vínculo
gerente↔cobrador é greenfield total.

**Decisões de negócio fechadas com o usuário:**
- Critério de atraso = maior atraso entre parcelas pendentes do cliente
  (reaproveita `clientMaxOverdueDays`).
- Granularidade da carteira continua por **cliente** (não por venda) — se
  uma venda do cliente sai da faixa, o cliente inteiro migra junto.
- Redistribuição automática cai em **fila do gestor com confirmação
  manual** (não reatribui direto a outro cobrador) — reaproveita
  `user_id = NULL` + motivo novo `fora_da_faixa` em
  `atribuicoes_historico`, sem coluna de status derivado nova.
- Faixas de atraso configuradas **por cobrador individual** (não por
  perfil).
- **Visita agendada ativa trava a saída automática**, igual acordo ativo
  — precisa estender o guard (hoje só checa acordo).

**Ordem de implementação (etapas pequenas) — todas no mesmo dia, 2026-11-03:**
1. migration `collection_attempts.collector_id` — **concluída** (commits
   `092768d`/`765f0f5`): coluna nullable, populada nos 3 pontos de
   inserção (`addAttempt`, `criarAcordo`, `LogContactModal`). Em produção
   (`db push` confirmado pelo usuário).
2. função SQL `cliente_max_atraso_dias` espelhando `clientMaxOverdueDays`
   — **concluída** (commit `7e089de`), validada contra produção antes de
   commitar. Em produção.
3. `collector_overdue_ranges` (faixa por cobrador, com vigência) + RPC
   `definir_faixa_atraso_cobrador` — **concluída** (commit `7e089de`). Em
   produção.
4. `manager_collector_links` (vínculo gerente↔cobrador, com vigência) +
   RPCs `vincular_cobrador_a_gerente`/`desvincular_cobrador` — **concluída**
   (commit `7e089de`). Em produção.
   UI das etapas 3/4: modal "Faixa & Equipe" em `UserManagement.tsx`
   (commit `a7f3e20`), testado ao vivo logado como gestor.
5. Metas: `MonthlyGoalEditModal` reposicionado (acessível direto do menu
   de cada cobrador em Usuários, commit `3a069f8`) + card "Meta da
   equipe (mês atual)" em `CollectorsSummary.tsx`. **Achado testando ao
   vivo:** `MonthlyGoalEditModal` gravava a meta direto via supabase, sem
   nunca chamar `fetchMonthlyGoals` — nada no app via a meta nova até
   recarregar a página inteira. Corrigido trocando para `setMonthlyGoal`
   do contexto, que já faz upsert + refresh (commit `42f223c`). Card
   "Recuperação do Mês" (painel do cobrador) também ajustado: mostrava
   R$100mil fixo quando não havia meta cadastrada, agora mostra "sem
   meta" (commit `b159290`).
6. "Clientes urgentes" — **concluída** (commit `494fb96`): nova aba na
   Agenda priorizada do cobrador, clientes dentro da própria faixa mas a
   ≤15 dias do teto (`URGENTE_SAIDA_CARTEIRA_DIAS` em `filters/priority.ts`),
   com destaque para quem não teve nenhuma ação. Única exceção de
   propósito à regra "um cliente, uma categoria" da agenda. Testada ao
   vivo (faixa temporária 1600-1635 para cliente com 1625 dias de atraso
   → badge "Faltam 10 dias na carteira" correto).
7. automação de saída/redistribuição — **dry-run concluído** (commit
   `c9c2a29`): `clientes_fora_da_faixa()` (só leitura, usa
   `cliente_max_atraso_dias` + guard novo `cliente_tem_visita_agendada_ativa`)
   e `executar_saida_carteira_fora_da_faixa()` (construída, **não ligada a
   cron nem botão** — ativação real pede confirmação explícita separada,
   combinado com o usuário). UI do dry-run ainda não construída (parte da
   etapa 8).
8. consolidação no painel do gerente (`CollectorsSummary.tsx`, commit
   `a7fe147`) — **concluída**: seção "Carteira automática por faixa de
   atraso" (consulta sob demanda, não carrega sozinha) com "Perto de sair
   da carteira agora" (lê `clientes_fora_da_faixa()`) e "Saíram da
   carteira por faixa no período" (lê `atribuicoes_historico` filtrado por
   `motivo = fora_da_faixa`, respeita o filtro de data já existente na
   tela). Testada ao vivo: faixa 1500–1600 para o cliente de 1625 dias
   (João Siriano Soares) → linha correta com "+25 dias" e badge "Travado:
   acordo ativo". Dado de teste removido depois.

**Achado preparando a etapa 7, sem relação com a feature — vulnerabilidade
de segurança corrigida no mesmo dia (commits `c9c2a29`, `c45de08`):**
várias RPCs `SECURITY DEFINER` (`criar_acordo`, `atribuir_clientes_em_lote`,
`remover_cobrador_em_lote`, `reagendar_visita`, as 3 RPCs novas da
etapa 3/4 desta sessão, entre outras) usavam
`IF app_current_user_type() <> 'manager' THEN RAISE EXCEPTION` como trava.
Para uma sessão **sem login** (`anon`), essa função retorna `NULL`, e
`NULL <> 'manager'` avalia `NULL` — um `IF` com condição `NULL` não executa
o `THEN`, a exceção nunca dispara, a função roda como se fosse gestor.
Confirmado por leitura (sem mutação) que essas funções tinham `EXECUTE`
liberado pra `anon` — este projeto Supabase tem `ALTER DEFAULT PRIVILEGES`
concedendo `EXECUTE` em função nova direto pros papéis `anon`/
`authenticated`/`service_role` (não via `PUBLIC` — só descoberto depois de
um primeiro `REVOKE ... FROM PUBLIC` não ter resolvido nada) — e rodam
`SECURITY DEFINER` com dono `postgres` (`BYPASSRLS`), então a RLS das
tabelas não protegia. Corrigido: guard trocado pra `IS DISTINCT FROM`
(NULL-safe) nas funções realmente vulneráveis, `EXECUTE` revogado de
`anon` explicitamente (não só de `PUBLIC`) em ~15 funções, e
`ALTER DEFAULT PRIVILEGES` fechando isso por padrão pra funções futuras.
Verificado com uma chamada real como `anon` (UUID inofensivo, sem
corresponder a nenhum registro real) — `HTTP 401` depois da correção,
antes teria rodado. Detalhe em `CLAUDE.md` (seção Banco/migrations).

Detalhe completo da análise na memória `estado-metas-vinculo-carteira`.

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
