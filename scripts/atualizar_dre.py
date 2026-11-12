#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
DRE mensal -> Power BI (tarefa BI_DRE_Mensal, dia 6, 10h).

  1. Focco Brasil (Ciclone/PostgreSQL): scripts/focco/dre/Rodar_Scripts_DRE.py
     -> \\\\ciclone\\Power BI - FoccoBrasil\\Focco Brasil\\DRE e \\Vendas\\fVendas
  2. Óticas (SSÓtica, navegador): scripts/ssotica/dre_ssotica.py
     -> \\\\ciclone\\Power BI - FoccoBrasil\\Oticas Luana\\DRE\\<ano>

As duas geram até o mês anterior. A 2ª roda mesmo se a 1ª falhar; o código
de saída é de erro se qualquer uma falhar.
Logs: scripts/focco/saida/dre_focco.log e scripts/ssotica/saida/dre_ssotica.log
"""
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent

ETAPAS = [
    AQUI / "focco" / "dre" / "Rodar_Scripts_DRE.py",
    AQUI / "ssotica" / "dre_ssotica.py",
]


def main() -> int:
    falhas = []
    for script in ETAPAS:
        print(f"==> {script.relative_to(AQUI)}", flush=True)
        if subprocess.run([sys.executable, str(script)], cwd=script.parent).returncode != 0:
            falhas.append(script.name)
    if falhas:
        print(f"Falhou: {', '.join(falhas)}", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
