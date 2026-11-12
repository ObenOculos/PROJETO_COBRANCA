# Agenda no Windows a leitura diária das vendas canceladas na SSÓtica, com
# gravação no app (cancelados_ssotica.py --gravar). Rodar uma vez, no
# PowerShell, como o usuário que fica logado na máquina:
#
#   powershell -ExecutionPolicy Bypass -File scripts\ssotica\agendar_tarefa.ps1
#
# Mesmo padrão da Cobranca_Sync_Financeiro_Ciclone: logon interativo (roda
# com a tela bloqueada, não com a sessão encerrada), StartWhenAvailable (se o
# PC estava desligado no horário, roda quando ligar) e 2 novas tentativas.
# Log: scripts\ssotica\saida\cancelados_ssotica.log

$ErrorActionPreference = 'Stop'
$nome   = 'Cobranca_Cancelados_SSOtica'
$pasta  = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $pasta 'cancelados_ssotica.py'
$python = (Get-Command python).Source

$acao     = New-ScheduledTaskAction -Execute $python -Argument "`"$script`" --gravar" -WorkingDirectory $pasta
$gatilho  = New-ScheduledTaskTrigger -Daily -At 6:00
$config   = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 10) `
              -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$usuario  = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $config -Principal $usuario `
  -Description 'Vendas canceladas na SSÓtica -> parcelas Cancelado no app (PROJETO_COBRANCA/scripts/ssotica).' -Force | Out-Null

Get-ScheduledTask -TaskName $nome | Select-Object TaskName, State
"Python: $python"
