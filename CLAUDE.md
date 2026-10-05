# Sistema de Cobrança (Focco Brasil)

App de cobrança para gestores e cobradores: carteira de clientes/títulos,
atribuição, agendamento e acompanhamento de visitas, pagamentos e desempenho.
Responda em **português**.

> **Progresso, decisões e pendências: [`docs/PROGRESSO.md`](docs/PROGRESSO.md).**
> Leia antes de propor mudanças estruturais e atualize ao fechar uma etapa.

## Stack

- React 18 + TypeScript + Vite 5 + Tailwind. Capacitor para o app mobile.
- Supabase (Postgres 17), projeto **Cobradores**, ref `rseiuknbwhmfjaiiywkj`
  (sa-east-1). Deploy do front na Vercel.
- Planilhas: `xlsx` 0.20.3 vindo do CDN da SheetJS (não do npm, que foi abandonado).

## Comandos

```bash
npm ci            # instalar (se `vite` não for reconhecido, faltou isto)
npm run dev       # http://localhost:5173
npx tsc -b        # checagem de tipos
npm run build     # tsc + vite build (reescreve public/version.json — não commitar só isso)
npx eslint <arquivo>
```

O lint já tem erros antigos em vários arquivos. Critério: **não aumentar** a
contagem do arquivo que você mexeu (compare com `git show HEAD:<arquivo>`).

## Banco / migrations

- Migrations em `supabase/migrations/`. Local e remoto estavam **53/53
  alinhados em 2026-10-02**.
- `.env` tem `SUPABASE_ACCESS_TOKEN` (Management API) — nunca imprimir o valor.
  Consultas de leitura: `POST https://api.supabase.com/v1/projects/<ref>/database/query`.
- Migration aplicada à mão no SQL Editor precisa ser registrada:
  `npx supabase migration repair --status applied <versao>` (senão um
  `db push` futuro tenta rodar de novo).
- Escritas em produção: confirmar com o usuário antes.

## Mapa do código

- `src/contexts/CollectionContext.tsx` (~4.3k linhas): estado global, todas as
  cargas e mutações do Supabase.
- `src/contexts/AuthContext.tsx`: login próprio contra a tabela `users` (ver
  pendência de segurança em PROGRESSO).
- `src/components/dashboard/VisitScheduler.tsx` (~5.4k): agendamento/calendário.
- `src/components/dashboard/VisitTracking.tsx` (~2.9k): Acompanhamento de Visitas.
- `src/config/`: **fontes únicas de regras** — `visitStatus.ts`,
  `visitOutcomes.ts`, `rescheduleReasons.ts`, `profiles.ts`.
- `src/filters/`, `src/utils/` (`fetchAllRows`, `supabasePagination`).
- Perfis (`UserType`): `manager`, `collector`, `internal_collector`,
  `third_party_collector`, `legal_collector`.

## Convenções que já custaram bug — siga

- **Regra de negócio em um lugar só.** Antes de escrever uma regra ("atrasada",
  "status do cliente", "data efetiva"), procure em `src/config/` e `src/filters/`.
  Visita atrasada = `isVisitOverdue` / `visitOverdueDays` de `config/visitStatus`.
- **Datas de calendário são strings `YYYY-MM-DD` no fuso local.** Use
  `todayLocalStr()`. Nunca `toISOString().split("T")[0]`, `getUTC*` ou
  `new Date("YYYY-MM-DD")` (é meia-noite UTC = 21h da véspera em Brasília).
- **Toda paginação com `.range()` precisa de ordem única**: termine com
  `.order("<pk>")` (`id`; `id_parcela` em `BANCO_DADOS`).
- Predicados com parâmetro opcional não vão direto em `.filter(fn)` — o índice
  do array vira o 2º argumento. Use `.filter((v) => fn(v))`.
- Domínio financeiro: aplicar a skill `arquiteto-cobranca` (fato histórico não
  se sobrescreve, correção é registro novo, nada de `DELETE` em histórico).

## Git

- Commits direto na `master`, mensagens em português; push só quando o usuário pedir
  (a Vercel publica a partir da `master`).
- Arquivos mistos CRLF/LF no repo (`core.autocrlf`). Em edição por script,
  preserve a quebra de linha do arquivo; o `grep` do Git Bash não mostra `\r`.
