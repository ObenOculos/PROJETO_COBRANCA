# Agenda no Windows a atualização diária da SSÓtica (atualizar_ssotica.py):
# contas a receber -> \ciclone (Power BI) + app, e vendas canceladas -> app.
# Rodar uma vez, no PowerShell, como o usuário que fica logado na máquina:
#
#   powershell -ExecutionPolicy Bypass -File scripts/ssotica/agendar_tarefa.ps1
#
# Substitui:
#   - Cobranca_Cancelados_SSOtica (só os cancelados) -> removida;
#   - "Python Óticas" (Selenium em Empresa_Oben\...\SSÓTICA) -> desativada
#     (não apagada: dá para religar no Agendador se precisar voltar atrás).
#
# Mesmo padrão da Cobranca_Sync_Financeiro_Ciclone: logon interativo (roda
# com a tela bloqueada, não com a sessão encerrada), StartWhenAvailable (se o
# PC estava desligado no horário, roda quando ligar) e 2 novas tentativas.
# Logs: scripts\ssotica\saida\contas_receber_ssotica.log e cancelados_ssotica.log

$ErrorActionPreference = 'Stop'
$nome   = 'Cobranca_Atualizar_SSOtica'
$pasta  = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $pasta 'atualizar_ssotica.py'
$python = (Get-Command python).Source

$acao     = New-ScheduledTaskAction -Execute $python -Argument "`"$script`"" -WorkingDirectory $pasta
$gatilho  = New-ScheduledTaskTrigger -Daily -At 6:00
$config   = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 10) `
              -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$usuario  = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $config -Principal $usuario `
  -Description 'SSÓtica -> Power BI (\ciclone) e Sistema de Cobrança: contas a receber + vendas canceladas (PROJETO_COBRANCA/scripts/ssotica).' -Force | Out-Null

if (Get-ScheduledTask -TaskName 'Cobranca_Cancelados_SSOtica' -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName 'Cobranca_Cancelados_SSOtica' -Confirm:$false
  'Removida: Cobranca_Cancelados_SSOtica (agora faz parte da nova)'
}
$antiga = Get-ScheduledTask | Where-Object { $_.TaskName -like 'Python *ticas' }
foreach ($t in $antiga) {
  Disable-ScheduledTask -TaskName $t.TaskName -TaskPath $t.TaskPath | Out-Null
  "Desativada: $($t.TaskName)"
}

Get-ScheduledTask -TaskName $nome | Select-Object TaskName, State
"Python: $python"
