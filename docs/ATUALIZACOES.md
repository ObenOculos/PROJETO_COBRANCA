# Atualizações automáticas (aplicativo e Power BI)

Tudo que alimenta o **Sistema de Cobrança** e o **Power BI** a partir do
Ciclone (ERP da Focco) e da SSÓtica (lojas) mora em `scripts/`. As tarefas do
Windows são registradas por **um** script:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/agendar_tarefas.ps1
```

Senhas e chaves: **só** no `.env` da raiz (fora do git) — `VITE_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SSO_EMAIL`/`SSO_PASSWORD` (SSÓtica), `ERP_*`
(Ciclone, sync), `PG*` (Ciclone, DRE), `FOCCO_PLANILHA_SENHA`.

## Rotinas

| Tarefa do Windows | Quando | Script | O que faz | Destino | Log |
|---|---|---|---|---|---|
| `Cobranca_Sync_Financeiro_Ciclone` | 5h, 12h, 17h | `ciclone/sync_financeiro.py` | Financeiro da Focco (títulos, baixas, cadastro) do Ciclone para o app | app (`BANCO_DADOS`, `clientes`) | `ciclone/saida/sync_<data>.log` |
| `Cobranca_Atualizar_SSOtica` | 6h | `ssotica/atualizar_ssotica.py` | 1) contas a receber das lojas → planilhas `BD_Contasareceber_*` + app (`importar_parcelas_ssotica`); 2) vendas canceladas → app; 3) parcelas em aberto no app que sumiram do relatório → confere na ficha do cliente e cancela as confirmadas | Power BI `Oticas Luana\Contas a Receber` + app | `ssotica/saida/*.log` |
| `Cobranca_Clientes_SSOtica` | a cada 14 dias, 7h30 | `ssotica/clientes_ssotica.py --gravar` | Exporta o cadastro de clientes da SSÓtica (salva no Dropbox `4 - Relação_Óticas_CPF`), liga o Cliente ID e completa telefone/nascimento/e-mail vazios | app (`clientes`) | `ssotica/saida/clientes_ssotica.log` |
| `BI_ContasReceber_Focco` | 19h | `focco/contas_receber_bi.py` | Planilha mestre `_CONTAS A RECEBER OBEN.xlsx` (Dropbox, com senha) → layout fixo do Power BI | Power BI `Focco Brasil\Contas a Receber` | `focco/saida/excel_extractor.log` |
| `BI_DRE_Mensal` | dia 6, 10h | `atualizar_dre.py` | DRE da Focco (`focco/dre`, PostgreSQL do Ciclone) e DRE das óticas (`ssotica/dre_ssotica.py`, SSÓtica com Chrome), até o mês anterior | Power BI `Focco Brasil\DRE`, `Focco Brasil\Vendas\fVendas`, `Oticas Luana\DRE\<ano>` | `focco/saida/dre_focco.log`, `ssotica/saida/dre_ssotica.log` |

Rodar à mão (mesmos comandos das tarefas), a partir da raiz do repositório:

```bash
python scripts/ssotica/sumidas_ssotica.py            # só lê e gera o CSV (sem --gravar)
python scripts/ssotica/clientes_ssotica.py           # só lê (sem --gravar)
python scripts/ciclone/sync_financeiro.py --dry-run  # só lê
python scripts/ssotica/dre_ssotica.py --unidades 9   # DRE de uma loja (grava no Power BI)
python scripts/ssotica/dre/executa_por_mes.py 2026 --meses 1-10   # Produtos de meses passados
```

## Pastas antigas (substituídas em 2026-11-12)

| Antes | Agora |
|---|---|
| `Empresa_Oben\...\SSÓTICA` (Selenium do contas a receber, tarefa "Python Óticas"; `Script_DRE` rodado à mão; `.env` com o login) | `scripts/ssotica` (+ `dre/`), login no `.env` da raiz |
| `Empresa_Oben\...\DRE_Focco` (tarefa `DRE_Atualização`) | `scripts/focco/dre` + `BI_DRE_Mensal` |
| `Empresa_Oben\...\Arquivo_Matriz` (tarefa `Atualizar_BI`, versão antiga sem `PARCELA` que sobrescrevia às 19h a versão nova das 9h30) | `scripts/focco/contas_receber_bi.py` (versão nova) |
| `Projetos_Dev\Ciclone\Esquema_SQL\sync_cobranca` | `scripts/ciclone` (o `.env` do `apps/consulta_pedidos` continua lá para os outros apps do Ciclone) |
| `Dropbox\...\Arquivos_Atualizados` — processo do **Cedrus** (`Rodar_Todos_os_Scripts_e_Upload_Cedrus`, 9h30/18h30) | **encerrado em 13/11/2026** (o usuário não quer mais atualizar o Cedrus; o último envio, 12/11 18h42, já tinha falhado por captcha): tarefa removida (`agendar_tarefas.ps1 -RemoverCedrus`) e pastas do Cedrus na Lixeira em 13/11 (inclusive `6 - Backup`, `7 - Alteração_Status`, `COMPROVANTES`, `APURAÇÃO MENSAL 2026` e `DIAGNOSTICO_VALOR_TITULO`, com o aval do usuário). A Consulta de Títulos do Cliente (janela Tkinter, só leitura no Ciclone) foi mantida e veio para `scripts/ciclone/consulta_titulos/` (duplo-clique no `Consulta_Titulos_Cliente.bat`). Ficam no Dropbox: `1 - Banco_de_Dados\Focco\_CONTAS A RECEBER OBEN.xlsx` (origem do Power BI da Focco) e `4 - Relação_Óticas_CPF` (bases de clientes) |
