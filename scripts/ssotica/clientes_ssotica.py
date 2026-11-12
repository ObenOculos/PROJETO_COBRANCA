#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Cadastro de clientes da SSÓtica -> cadastro do cliente no app (a cada 14 dias).

  1. pede a exportação "Exportar Clientes" (Cadastro > Clientes, ativos e
     inativos) -- a SSÓtica gera em segundo plano; o script acompanha e baixa;
     guarda em DESTINO_BASE como BASE_CLIENTE_SSÓTICA_dd-mm-aaaa.xlsx;
  2. liga cada cliente do app ao "Cliente ID" da SSÓtica
     (clientes.codigo_cliente_ssotica, migration 20261112000004): pelo CPF/CNPJ;
     CPF genérico (000.000..., criado na planilha para quem não tem CPF na
     SSÓtica) por nome + loja de cadastro, ou só nome, e só com casamento
     único. Um Cliente ID nunca vai para dois clientes;
  3. completa o cadastro do app SEM apagar nem trocar nada (decisão do
     usuário em 2026-11-12 -- o cobrador pode ter corrigido o que está lá):
       - telefone da SSÓtica que o app não tem (comparado pelos 8 últimos
         dígitos) vai para o 1º campo VAZIO entre telefone, celular,
         celular1, celular2; sem campo vazio, fica de fora (relatório);
       - data de nascimento e e-mail só quando vazios no app.

Sem --gravar é só leitura (relatório em saida/clientes_ssotica_<data>.csv).
O sumidas_ssotica.py usa o Cliente ID para abrir a ficha direto.

Uso:
    python scripts/ssotica/clientes_ssotica.py                 # baixa a base e mostra o que mudaria
    python scripts/ssotica/clientes_ssotica.py --gravar        # ... e grava no app
    python scripts/ssotica/clientes_ssotica.py --base <xlsx>   # usa um arquivo já baixado
"""
import argparse
import collections
import csv
import io
import logging
import re
import sys
import time
import unicodedata
from datetime import date, datetime
from pathlib import Path

import pandas as pd
import requests

from cancelados_ssotica import BASE_URL, SAIDA, SSOtica, _token, config_supabase, credenciais_ssotica

log = logging.getLogger("clientes_ssotica")

DESTINO_BASE = Path(r"C:\Users\User\Dropbox\5. DNA COBRANÇA GERAL\Cobrança_Focco\Arquivos_Atualizados"
                    r"\4 - Relação_Óticas_CPF")
CAMPOS_FONE_APP = ("telefone", "celular", "celular1", "celular2")
CAMPOS_FONE_SS = ("telefone", "celular", "celular1", "celular2", "celular3", "celular4", "celular5")
DIAS_GUARDAR = 90


# ---------------------------------------------------------------------------
# SSÓtica: exportação do cadastro
# ---------------------------------------------------------------------------

def exportar_clientes(ss: SSOtica) -> bytes:
    url = f"{BASE_URL}/cadastro/cliente"
    pagina = ss._req("GET", url)
    # A exportação segue o filtro da tela, guardado na sessão: ativos e inativos.
    ss._req("POST", url, data={
        "_token": _token(pagina.text), "formPosted": "1", "search_Cliente": "",
        "ativoInativo_Cliente": "AMBOS", "tipoPeriodo_Cliente": "", "periodo_Cliente[periodo]": "TUDO",
        "periodo_Cliente[inicio]": "01/01/2000", "periodo_Cliente[fim]": "31/12/2099",
        "cidade_Cliente": "", "bairro_Cliente": "",
    })
    pagina = ss._req("GET", url)
    h = {"X-Requested-With": "XMLHttpRequest", "Accept": "application/json"}
    r = ss.s.post(f"{url}/exportar/clientes", data={"_token": _token(pagina.text)}, headers=h, timeout=120)
    if r.status_code not in (200, 409):
        raise RuntimeError(f"Exportação de clientes não iniciou ({r.status_code}): {r.text[:300]}")
    d = r.json()
    if d.get("modo") == "direto":
        return ss._req("GET", d["link_download"]).content
    t0 = time.time()
    while d.get("status") != "concluido":
        if d.get("status") == "falha":
            raise RuntimeError(f"Exportação de clientes falhou na SSÓtica: {d.get('mensagem_erro')}")
        if time.time() - t0 > 1800:
            raise RuntimeError("Exportação de clientes não terminou em 30 min.")
        time.sleep(5)
        d = ss._req("GET", d["link_status"], headers={"Accept": "application/json"}).json()
    log.info("Exportação pronta: %s clientes (%.0fs)", d.get("total"), time.time() - t0)
    conteudo = ss._req("GET", d["link_baixar"]).content
    if not conteudo.startswith(b"PK"):
        raise RuntimeError("A exportação de clientes não veio como planilha.")
    return conteudo


# ---------------------------------------------------------------------------
# Normalização
# ---------------------------------------------------------------------------

def _vazio(v) -> bool:
    return v is None or (isinstance(v, float) and pd.isna(v)) or str(v).strip() == ""


def _nome(t) -> str:
    t = unicodedata.normalize("NFKD", str(t or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", t).strip().upper()


def _fone8(v) -> str:
    d = re.sub(r"\D", "", str(v or ""))
    return d[-8:] if len(d) >= 8 else ""


def _fone_app(v) -> str | None:
    """'+5588996836578' (exportação) -> '(88) 9.9683-6578' (formato do app e do
    relatório de contas a receber). Número que não for fixo/celular com DDD
    fica de fora."""
    d = re.sub(r"\D", "", str(v or ""))
    if len(d) in (12, 13) and d.startswith("55"):
        d = d[2:]
    if len(d) == 11 and d[2] == "9":
        return f"({d[:2]}) {d[2]}.{d[3:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return None


def _nascimento(v) -> str | None:
    if _vazio(v):
        return None
    try:
        d = pd.to_datetime(v, errors="coerce", dayfirst=False)
    except Exception:
        return None
    # Menos de 5 anos de idade: erro de digitação na loja (visto: 12 casos).
    if pd.isna(d) or not (1900 <= d.year <= date.today().year - 5):
        return None
    return d.strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# Banco
# ---------------------------------------------------------------------------

def _get(url: str, chave: str, tabela: str, params: dict) -> list[dict]:
    h = {"apikey": chave, "Authorization": f"Bearer {chave}"}
    r = requests.get(f"{url}/rest/v1/{tabela}", headers=h, params=params, timeout=120)
    r.raise_for_status()
    return r.json()


def coluna_codigo_existe(url: str, chave: str) -> bool:
    """codigo_cliente_ssotica só existe depois da migration 20261112000004."""
    h = {"apikey": chave, "Authorization": f"Bearer {chave}"}
    r = requests.get(f"{url}/rest/v1/clientes", headers=h,
                     params={"select": "codigo_cliente_ssotica", "limit": "1"}, timeout=60)
    return r.status_code == 200


def clientes_do_app(url: str, chave: str, com_codigo: bool) -> list[dict]:
    campos = ("id,nome,documento,data_nascimento,email," + ("codigo_cliente_ssotica," if com_codigo else "")
              + ",".join(CAMPOS_FONE_APP))
    linhas, ultimo = [], 0
    while True:
        lote = _get(url, chave, "clientes", {"select": campos, "id": f"gt.{ultimo}", "order": "id", "limit": "1000"})
        linhas += lote
        if len(lote) < 1000:
            return linhas
        ultimo = lote[-1]["id"]


def lojas_dos_genericos(url: str, chave: str) -> dict[str, set[str]]:
    """documento genérico -> lojas onde tem parcela (para casar com 'Cadastrado Em')."""
    res: dict[str, set[str]] = {}
    ultimo = 0
    while True:
        lote = _get(url, chave, "BANCO_DADOS", {
            "select": "id_parcela,documento,nome_da_loja", "documento": "like.000.000*",
            "id_parcela": f"gt.{ultimo}", "order": "id_parcela", "limit": "1000"})
        for p in lote:
            res.setdefault(p["documento"], set()).add(_nome(p["nome_da_loja"]))
        if len(lote) < 1000:
            return res
        ultimo = lote[-1]["id_parcela"]


# ---------------------------------------------------------------------------
# Comparação
# ---------------------------------------------------------------------------

def ligar_ids(app: list[dict], base: pd.DataFrame, lojas_gen: dict[str, set[str]]) -> dict[int, tuple[str, str]]:
    """id do cliente no app -> (Cliente ID da SSÓtica, como casou)."""
    por_doc = {str(r["Documento"]).strip(): str(r["Cliente ID"]) for _, r in base.iterrows()
               if not _vazio(r["Documento"])}
    sem_doc = base[base["Documento"].map(_vazio)]
    por_nome_loja: dict[tuple, list[str]] = collections.defaultdict(list)
    por_nome: dict[str, list[str]] = collections.defaultdict(list)
    for _, r in sem_doc.iterrows():
        por_nome_loja[(_nome(r["Nome / Razão Social"]), _nome(r["Cadastrado Em"]))].append(str(r["Cliente ID"]))
        por_nome[_nome(r["Nome / Razão Social"])].append(str(r["Cliente ID"]))

    ligado: dict[int, tuple[str, str]] = {}
    for c in app:
        doc = (c["documento"] or "").strip()
        if doc in por_doc:
            ligado[c["id"]] = (por_doc[doc], "cpf")
        elif doc.startswith("000.000"):
            nome = _nome(c["nome"])
            cands = {i for loja in lojas_gen.get(doc, ()) for i in por_nome_loja.get((nome, loja), [])}
            if len(cands) == 1:
                ligado[c["id"]] = (cands.pop(), "nome+loja")
            elif not cands and len(por_nome.get(nome, [])) == 1:
                ligado[c["id"]] = (por_nome[nome][0], "nome")
    # Um Cliente ID em dois clientes do app: não liga nenhum dos dois.
    contagem = collections.Counter(v[0] for v in ligado.values())
    repetidos = {k for k, n in contagem.items() if n > 1}
    if repetidos:
        log.warning("%d Cliente ID casaram com mais de um cliente do app: ficam sem ligação", len(repetidos))
    return {k: v for k, v in ligado.items() if v[0] not in repetidos}


def mudancas(app: list[dict], base: pd.DataFrame, ligado: dict[int, tuple[str, str]]) -> list[dict]:
    por_id = {str(r["Cliente ID"]): r for _, r in base.iterrows()}
    saida = []
    for c in app:
        if c["id"] not in ligado:
            continue
        cid, como = ligado[c["id"]]
        b = por_id[cid]
        upd: dict = {}
        if (c.get("codigo_cliente_ssotica") or "") != cid:
            upd["codigo_cliente_ssotica"] = cid
        # Telefones: só acrescenta, no 1º campo vazio.
        tem = {_fone8(c.get(k)) for k in CAMPOS_FONE_APP if _fone8(c.get(k))}
        vazios = [k for k in CAMPOS_FONE_APP if _vazio(c.get(k))]
        sobrou = []
        for k in CAMPOS_FONE_SS:
            fone = _fone_app(b.get(k))
            f8 = _fone8(fone)
            if not fone or f8 in tem:
                continue
            tem.add(f8)
            if vazios:
                upd[vazios.pop(0)] = fone
            else:
                sobrou.append(fone)
        if not c.get("data_nascimento"):
            n = _nascimento(b.get("Data de Nascimento"))
            if n:
                upd["data_nascimento"] = n
        email = b.get("email")
        if _vazio(c.get("email")) and not _vazio(email) and "@" in str(email):
            upd["email"] = str(email).strip()
        if upd or sobrou:
            saida.append({"id": c["id"], "documento": c["documento"], "nome": c["nome"], "cliente_id_ssotica": cid,
                          "ligado_por": como, "mudancas": upd, "telefones_sem_campo_vazio": sobrou})
    return saida


def gravar(url: str, chave: str, lista: list[dict]) -> int:
    h = {"apikey": chave, "Authorization": f"Bearer {chave}", "Content-Type": "application/json",
         "Prefer": "return=minimal"}
    n = 0
    for m in lista:
        if not m["mudancas"]:
            continue
        r = requests.patch(f"{url}/rest/v1/clientes", headers=h, params={"id": f"eq.{m['id']}"},
                           json=m["mudancas"], timeout=60)
        if r.status_code >= 400:
            log.warning("Cliente %s não atualizado (%s): %s", m["id"], r.status_code, r.text[:200])
            continue
        n += 1
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gravar", action="store_true", help="grava no app (sem isto, só o relatório)")
    ap.add_argument("--base", type=Path, help="usar uma exportação já baixada em vez de pedir à SSÓtica")
    args = ap.parse_args()

    SAIDA.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout),
                  logging.FileHandler(SAIDA / "clientes_ssotica.log", encoding="utf-8")],
    )
    limite = time.time() - DIAS_GUARDAR * 86400
    for velho in SAIDA.glob("clientes_ssotica_*.csv"):
        if velho.stat().st_mtime < limite:
            velho.unlink()

    if args.base:
        conteudo = args.base.read_bytes()
    else:
        ss = SSOtica(*credenciais_ssotica())
        ss.login()
        conteudo = exportar_clientes(ss)
        if DESTINO_BASE.exists():
            # Nunca sobrescreve: o usuário também salva exportações manuais
            # com esse padrão de nome (e o arquivo pode estar aberto no Excel).
            destino = DESTINO_BASE / f"BASE_CLIENTE_SSÓTICA_{date.today():%d-%m-%Y}.xlsx"
            if destino.exists():
                destino = destino.with_name(f"BASE_CLIENTE_SSÓTICA_{datetime.now():%d-%m-%Y_%H%M}.xlsx")
            try:
                destino.write_bytes(conteudo)
                log.info("Base salva em %s", destino)
            except OSError as e:
                log.warning("Base não foi salva no Dropbox (%s); segue com a cópia em memória.", e)
        else:
            log.warning("Pasta %s não encontrada: base não foi salva no Dropbox.", DESTINO_BASE)
    base = pd.read_excel(io.BytesIO(conteudo), dtype=str)
    falta = {"Documento", "Cliente ID", "Nome / Razão Social", "Cadastrado Em"} - set(base.columns)
    if falta:
        log.error("Exportação sem as colunas %s (formato mudou?). Nada feito.", ", ".join(sorted(falta)))
        return 1
    base = base[~base["Cliente ID"].map(_vazio)]
    log.info("Base da SSÓtica: %d clientes (%d sem CPF/CNPJ)", len(base), int(base["Documento"].map(_vazio).sum()))

    url, chave = config_supabase()
    com_codigo = coluna_codigo_existe(url, chave)
    if not com_codigo:
        if args.gravar:
            log.error("Coluna clientes.codigo_cliente_ssotica não existe: aplique a migration "
                      "20261112000004 (db push) antes de gravar. Nada feito.")
            return 1
        log.warning("Coluna clientes.codigo_cliente_ssotica ainda não existe (migration 20261112000004): "
                    "relatório sem ela.")
    app = clientes_do_app(url, chave, com_codigo)
    ligado = ligar_ids(app, base, lojas_dos_genericos(url, chave))
    como = collections.Counter(v[1] for v in ligado.values())
    gen = [c for c in app if (c["documento"] or "").startswith("000.000")]
    log.info("App: %d clientes; ligados ao Cliente ID: %d (%s); CPF genérico: %d, sem ligação: %d",
             len(app), len(ligado), dict(como), len(gen), sum(1 for c in gen if c["id"] not in ligado))

    lista = mudancas(app, base, ligado)
    cont = collections.Counter()
    for m in lista:
        for k in m["mudancas"]:
            cont["telefone" if k in CAMPOS_FONE_APP else k] += 1
        if m["telefones_sem_campo_vazio"]:
            cont["telefone novo sem campo vazio"] += len(m["telefones_sem_campo_vazio"])
    log.info("Mudanças: %d clientes; por campo: %s", sum(1 for m in lista if m["mudancas"]), dict(cont))
    if lista:
        rel = SAIDA / f"clientes_ssotica_{datetime.now():%Y%m%d_%H%M}.csv"
        with rel.open("w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(["id", "documento", "nome", "cliente_id_ssotica", "ligado_por", "mudancas",
                        "telefones_sem_campo_vazio"])
            for m in lista:
                w.writerow([m["id"], m["documento"], m["nome"], m["cliente_id_ssotica"], m["ligado_por"],
                            "; ".join(f"{k}={v}" for k, v in m["mudancas"].items()),
                            " | ".join(m["telefones_sem_campo_vazio"])])
        log.info("Relatório: %s", rel)

    if args.gravar:
        n = gravar(url, chave, lista)
        log.info("Gravado no app: %d clientes atualizados", n)
    else:
        log.info("Modo relatório: nada foi gravado (use --gravar).")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except BaseException:
        log.exception("Falhou")
        sys.exit(1)
