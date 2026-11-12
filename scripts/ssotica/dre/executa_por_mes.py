"""
Executa os scripts de Produtos mes a mes para um ano escolhido
(gera MM.AAAA.xlsx de cada mes em cada unidade).

Exemplos:
    python executa_por_mes.py 2026                    -> jan ate o mes anterior ao atual (ou jan-dez se o ano ja fechou)
    python executa_por_mes.py 2026 --meses 1-3        -> janeiro a marco
    python executa_por_mes.py 2026 --meses 1,4,7      -> janeiro, abril e julho
    python executa_por_mes.py 2026 --unidades 1,3     -> apenas as unidades 1 e 3
    python executa_por_mes.py                         -> pergunta o ano (e os meses) no terminal

Para cada unidade o script de Produtos roda uma vez: faz login uma unica vez e, na mesma
sessao, troca a data e exporta cada mes. Os meses sao passados pela variavel de ambiente
DRE_MESES_REF (ex: 2026-01,2026-02).
"""

import argparse
import sys
from datetime import datetime
from typing import List, Set

from executa_todos import unidades, montar_caminho_script, executar_script, scripts_ignorados

MESES_NOME = [
    "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


def meses_padrao(ano: int) -> List[int]:
    """Ano corrente: janeiro ate o mes anterior. Ano passado: ano inteiro."""
    hoje = datetime.now()
    if ano < hoje.year:
        return list(range(1, 13))
    if ano == hoje.year:
        return list(range(1, hoje.month))
    return []


def interpretar_lista(texto: str) -> List[int]:
    """Converte '1-3,5,7' em [1, 2, 3, 5, 7]."""
    numeros: Set[int] = set()
    for parte in texto.replace(" ", "").split(","):
        if not parte:
            continue
        if "-" in parte:
            ini, fim = (int(x) for x in parte.split("-"))
            numeros.update(range(ini, fim + 1))
        else:
            numeros.add(int(parte))
    return sorted(numeros)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Executa os scripts de Produtos mes a mes para um ano.")
    parser.add_argument("ano", type=int, nargs="?", help="Ano a pesquisar (ex: 2026)")
    parser.add_argument("--meses", help="Meses a pesquisar, ex: 1-3 ou 1,4,7 (padrao: todos ate o mes anterior)")
    parser.add_argument("--unidades", help="Numeros das unidades, ex: 1,3 ou 1-5 (padrao: todas)")
    args = parser.parse_args()

    # Modo interativo (ex: duplo clique no arquivo)
    if args.ano is None:
        args.ano = int(input("Ano a pesquisar (ex: 2026): ").strip())
        if args.meses is None:
            resp = input("Meses (ex: 1-3 ou 1,4,7) [Enter = todos ate o mes anterior]: ").strip()
            args.meses = resp or None
    return args


def main() -> int:
    # Evita UnicodeEncodeError (─, ✓, ❌) quando a saida nao e um console UTF-8
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    args = parse_args()
    ano = args.ano

    meses = interpretar_lista(args.meses) if args.meses else meses_padrao(ano)
    meses = [m for m in meses if 1 <= m <= 12]
    if not meses:
        print(f"Nenhum mes valido para {ano}.")
        return 1

    if args.unidades:
        numeros = interpretar_lista(args.unidades)
        unidades_sel = [u for u in unidades if int(u.split("_")[0]) in numeros]
    else:
        unidades_sel = unidades

    print(f"\n{'='*60}")
    print(f"PRODUTOS MES A MES - ANO {ano}")
    print(f"Meses   : {', '.join(f'{ano} - {MESES_NOME[m-1]}' for m in meses)}")
    print(f"Unidades: {', '.join(unidades_sel)}")
    print(f"Hora    : {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print(f"{'='*60}\n")

    total = 0
    sucesso = 0
    erros: List[str] = []

    for unidade in unidades_sel:
        print(f"\n{'─'*60}")
        print(f"Processando unidade: {unidade}")
        print(f"{'─'*60}")

        caminho = montar_caminho_script(unidade, "Produtos")
        if not caminho.exists():
            print(f"⚠ Arquivo não encontrado: {caminho.name}")
            continue

        # Um login por unidade: o script troca a data e exporta cada mes na mesma sessao
        total += 1
        meses_ref = ",".join(f"{ano}-{m:02d}" for m in meses)
        if executar_script(caminho, env={"DRE_MESES_REF": meses_ref}, timeout=300 + 120 * len(meses)):
            sucesso += 1
        else:
            erros.append(f"{caminho.name} (veja o scraper.log da unidade para os meses com falha)")

    print(f"\n\n{'='*60}")
    print("RESUMO DA EXECUÇÃO")
    print(f"{'='*60}")
    print(f"Total de scripts: {total}")
    print(f"Sucesso: {sucesso}")
    print(f"Erros: {len(erros)}")
    if scripts_ignorados:
        print(f"Ignorados (loja sem acesso): {len(scripts_ignorados)}")
        for ign in scripts_ignorados:
            print(f"  - {ign}")
    if erros:
        print("\n⚠ Scripts com erro:")
        for erro in erros:
            print(f"  - {erro}")
    print(f"\nHora de término: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print(f"{'='*60}\n")

    return 0 if not erros else 1


if __name__ == "__main__":
    sys.exit(main())
