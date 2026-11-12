#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Atualização diária SSÓtica -> Power BI + Sistema de Cobrança, num passo só
(é o que a tarefa agendada roda; ver agendar_tarefa.ps1):

  1. contas_receber_ssotica.py --power-bi --app
     baixa o contas a receber de todas as lojas, grava as planilhas no
     \\\\ciclone (Power BI) e aplica no app (parcelas novas, pagamentos,
     vencimentos);
  2. cancelados_ssotica.py --gravar
     vendas canceladas na SSÓtica -> parcelas Cancelado no app.

O 2º roda mesmo se o 1º falhar (são independentes); o código de saída é de
erro se qualquer um falhar, para a tarefa mostrar "falhou".
Logs: saida/contas_receber_ssotica.log e saida/cancelados_ssotica.log.
"""
import subprocess
import sys
from pathlib import Path

PASTA = Path(__file__).resolve().parent

ETAPAS = [
    ["contas_receber_ssotica.py", "--power-bi", "--app"],
    ["cancelados_ssotica.py", "--gravar"],
]


def main() -> int:
    falhas = []
    for etapa in ETAPAS:
        print(f"==> {' '.join(etapa)}", flush=True)
        r = subprocess.run([sys.executable, str(PASTA / etapa[0]), *etapa[1:]], cwd=PASTA)
        if r.returncode != 0:
            falhas.append(etapa[0])
    if falhas:
        print(f"Falhou: {', '.join(falhas)}", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
