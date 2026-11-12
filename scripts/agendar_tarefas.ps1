# Agenda no Windows TODAS as atualizacoes do aplicativo e do Power BI.
# Fonte unica: o que estiver aqui e o que roda. Rodar de novo e seguro
# (-Force substitui a tarefa com o mesmo nome).
#
#   powershell -ExecutionPolicy Bypass -File scripts/agendar_tarefas.ps1
#
# Rotinas (detalhes em docs/ATUALIZACOES.md):
#   Cobranca_Sync_Financeiro_Ciclone  5h,12h,17h  Ciclone -> app (Focco)
#   Cobranca_Atualizar_SSOtica        6h          SSOtica -> app + Power BI (contas a receber,
#                                                 cancelados, parcelas sumidas)
#   Cobranca_Clientes_SSOtica         14 em 14 d  cadastro de clientes SSOtica -> app
#   BI_ContasReceber_Focco            19h         planilha da Focco -> Power BI
#   BI_DRE_Mensal                     dia 6, 10h  DRE Focco (Ciclone) + DRE oticas (SSOtica) -> Power BI
#
# Todas: logon interativo (roda com a tela bloqueada; a DRE das oticas abre o
# Chrome), StartWhenAvailable (PC desligado no horario -> roda quando ligar)
# e 2 novas tentativas. Logs em scripts\<pasta>\saida\.
#
# Substitui (2026-11-12): Atualizar_BI, DRE_Atualizacao e "Python Oticas"
# (removidas aqui) e os antigos scripts/ssotica/agendar_*.ps1.
# Rodar_Todos_os_Scripts_e_Upload_Cedrus fica ate o Cedrus acabar (15/11/2026):
# depois, rodar com -RemoverCedrus.

param([switch]$RemoverCedrus)

$ErrorActionPreference = 'Stop'
$scripts = Split-Path -Parent $MyInvocation.MyCommand.Path
$python  = (Get-Command python).Source
$usuario = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

function Config([int]$horas) {
  New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 10) `
    -ExecutionTimeLimit (New-TimeSpan -Hours $horas)
}

function Registrar($nome, $script, $argumentos, $gatilhos, $horas, $descricao) {
  $arquivo = Join-Path $scripts $script
  $acao = New-ScheduledTaskAction -Execute $python -Argument ("`"$arquivo`" $argumentos").Trim() `
            -WorkingDirectory (Split-Path -Parent $arquivo)
  Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilhos -Settings (Config $horas) `
    -Principal $usuario -Description $descricao -Force | Out-Null
  "Agendada: $nome"
}

Registrar 'Cobranca_Sync_Financeiro_Ciclone' 'ciclone\sync_financeiro.py' '' `
  @((New-ScheduledTaskTrigger -Daily -At 5:00), (New-ScheduledTaskTrigger -Daily -At 12:00),
    (New-ScheduledTaskTrigger -Daily -At 17:00)) 1 `
  'Ciclone -> Sistema de Cobranca: financeiro da Focco Brasil (PROJETO_COBRANCA/scripts/ciclone).'

Registrar 'Cobranca_Atualizar_SSOtica' 'ssotica\atualizar_ssotica.py' '' `
  (New-ScheduledTaskTrigger -Daily -At 6:00) 2 `
  'SSOtica -> Power BI e Sistema de Cobranca: contas a receber, cancelados, parcelas sumidas (PROJETO_COBRANCA/scripts/ssotica).'

# A cada 14 dias: preserva a data da proxima rodada se a tarefa ja existe.
$inicio = Get-Date '07:30'
$existente = Get-ScheduledTask -TaskName 'Cobranca_Clientes_SSOtica' -ErrorAction SilentlyContinue
if ($existente) { $inicio = [datetime]$existente.Triggers[0].StartBoundary }
Registrar 'Cobranca_Clientes_SSOtica' 'ssotica\clientes_ssotica.py' '--gravar' `
  (New-ScheduledTaskTrigger -Daily -DaysInterval 14 -At $inicio) 1 `
  'SSOtica -> Sistema de Cobranca: cadastro de clientes (Cliente ID, telefones, nascimento) a cada 14 dias.'

Registrar 'BI_ContasReceber_Focco' 'focco\contas_receber_bi.py' '' `
  (New-ScheduledTaskTrigger -Daily -At 19:00) 1 `
  'Planilha _CONTAS A RECEBER OBEN (Dropbox) -> Power BI da Focco (PROJETO_COBRANCA/scripts/focco).'

# Mensal (dia 6): New-ScheduledTaskTrigger nao tem gatilho mensal; cria pelo
# schtasks e aplica as mesmas configuracoes.
$dre = Join-Path $scripts 'atualizar_dre.py'
schtasks /Create /F /TN 'BI_DRE_Mensal' /SC MONTHLY /D 6 /ST 10:00 /IT `
  /TR "`"$python`" `"$dre`"" | Out-Null
$t = Get-ScheduledTask -TaskName 'BI_DRE_Mensal'
$t.Actions[0].WorkingDirectory = $scripts
Set-ScheduledTask -TaskName 'BI_DRE_Mensal' -Action $t.Actions -Settings (Config 4) -Principal $usuario | Out-Null
"Agendada: BI_DRE_Mensal"

foreach ($velha in 'Atualizar_BI', 'DRE_Atualização', 'Python Óticas') {
  if (Get-ScheduledTask -TaskName $velha -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $velha -Confirm:$false
    "Removida: $velha"
  }
}
if ($RemoverCedrus -and (Get-ScheduledTask -TaskName 'Rodar_Todos_os_Scripts_e_Upload_Cedrus' -ErrorAction SilentlyContinue)) {
  Unregister-ScheduledTask -TaskName 'Rodar_Todos_os_Scripts_e_Upload_Cedrus' -Confirm:$false
  'Removida: Rodar_Todos_os_Scripts_e_Upload_Cedrus'
}
