#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
DRE financeiro das óticas (SSÓtica > Financeiro > Resultado, período "Ano")
-> \\\\ciclone\\Power BI - FoccoBrasil\\Oticas Luana\\DRE\\<ano>\\BD_DRE_<loja>_<ano>.xlsx

Sem navegador (2026-11-12): substitui os 9 scripts dre/<loja>/*_Resultados.py,
que usavam o Chrome e travavam no seletor de empresa da tela (20 min tentando
clicar; visto na Excellence e em Poranga). Mesma tela, mesmos parâmetros e o
mesmo arquivo: o .xlsx que a SSÓtica exporta é gravado como veio (conferido
contra o arquivo gerado pelo Chrome em Quiterianópolis: só diferiu um
lançamento feito depois).

Ano: o do mês anterior (rodando em janeiro, fecha o ano anterior), como nos
outros relatórios da DRE.

Uso:
    python scripts/ssotica/dre_resultados.py                # todas as lojas
    python scripts/ssotica/dre_resultados.py --lojas 2,9    # pelo número da pasta em dre/
"""
import argparse
import sys
from datetime import date
from pathlib import Path

from dateutil.relativedelta import relativedelta

from cancelados_ssotica import BASE_URL, SSOtica, _token, credenciais_ssotica

DESTINO = Path(r"\\ciclone\Power BI - FoccoBrasil\Oticas Luana\DRE")

# nº da pasta em dre/ -> (código da empresa na SSÓtica, nome do arquivo sem o ano)
LOJAS = {
    "1": ("PwrbRL", "BD_DRE_Loja Eusebio"),
    "2": ("LOpApm", "BD_DRE_Loja Poranga"),
    "3": ("LDAdyO", "BD_DRE_Loja Crateus"),
    "4": ("PKKWkj", "BD_DRE_Loja Independencia"),
    "5": ("PbllBO", "BD_DRE_Loja Itapipoca"),
    "6": ("MWbgWv", "BD_DRE_Novo Oriente"),
    "7": ("PKrOJP", "BD_DRE_Externa Crateus"),
    "8": ("PzBXYZ", "BD_DRE_Excellence messejana"),
    "9": ("LQobRo", "BD_DRE_Quiterianopolis"),
}


def ano_referencia() -> int:
    return (date.today() - relativedelta(months=1)).year


def exportar(ss: SSOtica, cod: str, ano: int) -> bytes:
    url = f"{BASE_URL}/financeiro/resultado"
    pagina = ss._req("GET", url)
    hoje = date.today()
    # A empresa escolhida fica guardada na sessão; o export usa o último filtro.
    ss._req("POST", url, data={
        "_token": _token(pagina.text), "filterForm[empresa]": cod,
        "filterForm[tipoPeriodo]": "ANO", "filterForm[data][ANO]": f"01/01/{ano}", "filterForm[year]": str(ano),
        "filterForm[data][MES]": f"01/{hoje:%m/%Y}", "filterForm[data][SEMANA]": f"{hoje:%d/%m/%Y}",
    })
    conteudo = ss._req("GET", f"{url}/exportar?tipo=resultado").content
    if not conteudo.startswith(b"PK"):
        raise RuntimeError(f"Resultado da empresa {cod} não veio como planilha.")
    return conteudo


def rodar(lojas: list[str], ss: SSOtica | None = None) -> list[str]:
    """Exporta as lojas pedidas; devolve as que falharam."""
    if ss is None:
        ss = SSOtica(*credenciais_ssotica())
        ss.login()
    ano = ano_referencia()
    pasta = DESTINO / str(ano)
    pasta.mkdir(parents=True, exist_ok=True)
    falhas = []
    for n in lojas:
        cod, nome = LOJAS[n]
        destino = pasta / f"{nome}_{ano}.xlsx"
        try:
            conteudo = exportar(ss, cod, ano)
            temp = destino.with_name(f"~tmp_{destino.name}")
            temp.write_bytes(conteudo)
            temp.replace(destino)
            print(f"OK   Resultados {n} ({cod}): {destino} ({len(conteudo):,} bytes)", flush=True)
        except Exception as e:  # uma loja não derruba as outras
            print(f"ERRO Resultados {n} ({cod}): {e}", flush=True)
            falhas.append(f"Resultados {n}")
    return falhas


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lojas", help="números das pastas em dre/, ex.: 2,9 (padrão: todas)")
    args = ap.parse_args()
    lojas = [x.strip() for x in args.lojas.split(",")] if args.lojas else list(LOJAS)
    return 1 if rodar(lojas) else 0


if __name__ == "__main__":
    sys.exit(main())
