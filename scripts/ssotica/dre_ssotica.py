#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
DRE das óticas (SSÓtica) -> Power BI (\\\\ciclone\\Power BI - FoccoBrasil\\Oticas Luana\\DRE\\<ano>).

Roda, para cada loja, os scripts de scripts/ssotica/dre/<loja>/: Produtos
(mês anterior), Resultados e Vendas (ano do mês anterior, acumulado). Rodando
em qualquer dia de um mês, gera até o mês anterior -- por isso a tarefa é
mensal (dia 2). Os scripts usam navegador (Selenium/Chrome); vieram da pasta
antiga Empresa_Oben/.../SSÓTICA/Código_Óticas/Script_DRE em 2026-11-12, onde
eram rodados à mão.

Uso:
    python scripts/ssotica/dre_ssotica.py                 # todas as lojas
    python scripts/ssotica/dre_ssotica.py --unidades 9    # só a 9 (Quiterianópolis)
    python scripts/ssotica/dre/executa_por_mes.py 2026 --meses 1-10   # Produtos de meses passados
Log: saida/dre_ssotica.log
"""
import argparse
import sys
from datetime import datetime
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SAIDA = AQUI / "saida"
sys.path.insert(0, str(AQUI / "dre"))

import executa_todos as et  # noqa: E402


class _Tee:
    def __init__(self, *alvos):
        self.alvos = alvos

    def write(self, s):
        for a in self.alvos:
            a.write(s)
            a.flush()

    def flush(self):
        for a in self.alvos:
            a.flush()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--unidades", help="números das lojas, ex.: 9 ou 1,3 (padrão: todas)")
    args = ap.parse_args()

    SAIDA.mkdir(parents=True, exist_ok=True)
    log = open(SAIDA / "dre_ssotica.log", "a", encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    sys.stdout = _Tee(sys.stdout, log)

    escolhidas = {n.strip() for n in args.unidades.split(",")} if args.unidades else None
    unidades = [u for u in et.unidades if escolhidas is None or u.split("_")[0] in escolhidas]
    print(f"\n{'=' * 60}\nDRE SSÓtica — {datetime.now():%d/%m/%Y %H:%M} — {len(unidades)} loja(s)\n{'=' * 60}")

    erros = []
    for unidade in unidades:
        for tipo in et.tipos_script:
            caminho = et.montar_caminho_script(unidade, tipo)
            if not caminho.exists():
                print(f"⚠ não encontrado: {caminho}")
                erros.append(str(caminho))
                continue
            # Produtos pode exportar vários meses na mesma sessão; 30 min de folga.
            if not et.executar_script(caminho, timeout=1800):
                erros.append(caminho.name)

    print(f"\nFim {datetime.now():%H:%M} — erros: {len(erros)}"
          + (f" ({', '.join(erros)})" if erros else "")
          + (f" — lojas sem acesso: {len(et.scripts_ignorados)}" if et.scripts_ignorados else ""))
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
