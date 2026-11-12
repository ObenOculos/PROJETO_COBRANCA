# Agenda no Windows o clientes_ssotica.py --gravar a cada 14 dias (7h30, depois
# da atualizacao das 6h): exporta o cadastro de clientes da SSOtica, salva no
# Dropbox (BASE_CLIENTE_SSOTICA_dd-mm-aaaa.xlsx), liga o Cliente ID e completa
# telefone/nascimento/e-mail vazios no app.
# Rodar uma vez, no PowerShell, como o usuario que fica logado na maquina:
#
#   powershell -ExecutionPolicy Bypass -File scripts/ssotica/agendar_clientes.ps1
#
# Mesmo padrao da Cobranca_Atualizar_SSOtica (agendar_tarefa.ps1).
# Log: scripts\ssotica\saida\clientes_ssotica.log

$ErrorActionPreference = 'Stop'
$nome   = 'Cobranca_Clientes_SSOtica'
$pasta  = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $pasta 'clientes_ssotica.py'
$python = (Get-Command python).Source

$acao     = New-ScheduledTaskAction -Execute $python -Argument "`"$script`" --gravar" -WorkingDirectory $pasta
$gatilho  = New-ScheduledTaskTrigger -Daily -DaysInterval 14 -At 7:30
$config   = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 10) `
              -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$usuario  = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $config -Principal $usuario `
  -Description 'SSOtica -> Sistema de Cobranca: cadastro de clientes (Cliente ID, telefones, nascimento) a cada 14 dias (PROJETO_COBRANCA/scripts/ssotica).' -Force | Out-Null
"Agendada: $nome (a cada 14 dias, 7h30)"
