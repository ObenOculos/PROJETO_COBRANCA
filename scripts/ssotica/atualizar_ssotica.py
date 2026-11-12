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
     vendas canceladas na SSÓtica -> parcelas Cancelado no app;
  3. sumidas_ssotica.py --gravar
     parcelas em aberto no app que não vieram no relatório: confere cada uma
     na ficha do cliente; cancelada na loja -> Cancelado no app, o resto vai
     para saida/sumidas_ssotica_<data>.csv.

O 2º roda mesmo se o 1º falhar (são independentes). O 3º só roda se o 1º deu
certo (depende do relatório de hoje). O código de saída é de erro se qualquer
um falhar, para a tarefa mostrar "falhou".
Logs: saida/contas_receber_ssotica.log, saida/cancelados_ssotica.log e
saida/sumidas_ssotica.log.
"""
import subprocess
import sys
from pathlib import Path

PASTA = Path(__file__).resolve().parent

ETAPAS = [
    ["contas_receber_ssotica.py", "--power-bi", "--app"],
    ["cancelados_ssotica.py", "--gravar"],
    ["sumidas_ssotica.py", "--gravar"],
]
# etapa -> etapa que precisa ter dado certo antes
DEPENDE_DE = {"sumidas_ssotica.py": "contas_receber_ssotica.py"}


def main() -> int:
    falhas = []
    for etapa in ETAPAS:
        if DEPENDE_DE.get(etapa[0]) in falhas:
            print(f"==> {etapa[0]} pulado: {DEPENDE_DE[etapa[0]]} falhou", flush=True)
            falhas.append(etapa[0])
            continue
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
