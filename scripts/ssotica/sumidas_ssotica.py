#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Parcelas em aberto no app que sumiram do contas a receber da SSÓtica.

O relatório de contas a receber só filtra Em aberto / Pago / Renegociado /
SPC: parcela cancelada SOZINHA na loja (a venda continua ativa) some dele e o
app seguia cobrando. Venda cancelada inteira já é tratada pelo
cancelados_ssotica.py; isto aqui pega o resto.

Sumir do relatório NÃO basta para cancelar (pode ser SPC, título refeito,
falha de download...). Em 2026-11-12, das 223 sumidas, só 122 eram cancelamento
confirmado. Por isso cada sumida é conferida na ficha do cliente na SSÓtica
(Cadastro > Cliente > aba Crediário), que mostra a situação de cada parcela:

  1. lê os IDs que vieram no relatório de hoje (saida/contas_receber_ids.json,
     gravado pelo contas_receber_ssotica.py --app; se não for de hoje, para);
  2. busca no app as parcelas Em atraso / A vencer dessas lojas que não
     vieram -> sumidas (acima de LIMITE_SUMIDAS, para: download quebrado);
  3. para cada cliente (CPF/CNPJ), abre a ficha e casa cada sumida com uma
     parcela da SSÓtica: mesma loja + nº da parcela + vencimento + valor e,
     quando o app tem o nº do título/venda, o mesmo número. Sem número no app,
     não pode haver outra linha do app com o título/parcela casado;
  4. casamento único e situação "Cancelado" -> cancela no app pela função
     cancelar_parcelas_ssotica (a mesma das vendas canceladas: não mexe em
     parcela paga nem em acordo ativo; registra em vendas_canceladas);
  5. todo o resto vai para saida/sumidas_ssotica_<data>.csv (conferência do
     gestor; nada é alterado).

Sem --gravar é só leitura.

Uso:
    python scripts/ssotica/sumidas_ssotica.py            # confere e gera o CSV
    python scripts/ssotica/sumidas_ssotica.py --gravar   # ... e cancela as confirmadas
"""
import argparse
import collections
import csv
import json
import logging
import re
import sys
import time
from datetime import date, datetime

import requests
from bs4 import BeautifulSoup

from cancelados_ssotica import (BASE_URL, SAIDA, SSOtica, _data_br, _texto, _token, _valor_br,
                                config_supabase, credenciais_ssotica)
from contas_receber_ssotica import ARQUIVO_IDS

log = logging.getLogger("sumidas_ssotica")

DIAS_GUARDAR = 30
LIMITE_SUMIDAS = 1500      # mais que isso = relatório incompleto, não confere
STATUS_EM_ABERTO = ("Em atraso", "A vencer")
# A mesma empresa na SSÓtica foi "Itapipoca Ext" e virou "Messejana".
MESMA_EMPRESA = {"Oticas Luana Itapipoca Ext", "Excellence Óticas - Messejana"}


# ---------------------------------------------------------------------------
# SSÓtica: ficha do cliente
# ---------------------------------------------------------------------------

def buscar_clientes(ss: SSOtica, documento: str) -> list[str]:
    """ids (hash) dos clientes cujo cadastro bate com o CPF/CNPJ."""
    url = f"{BASE_URL}/cadastro/cliente"
    pagina = ss._req("GET", url)
    r = ss._req("POST", url, data={
        "_token": _token(pagina.text), "formPosted": "1",
        "search_Cliente": documento,
        "ativoInativo_Cliente": "AMBOS", "tipoPeriodo_Cliente": "",
        "periodo_Cliente[periodo]": "TUDO",
        "periodo_Cliente[inicio]": "01/01/2000", "periodo_Cliente[fim]": "31/12/2099",
        "cidade_Cliente": "", "bairro_Cliente": "",
    })
    return list(dict.fromkeys(re.findall(r"/cadastro/cliente/([A-Za-z0-9]+)/detalhe", r.text)))


def crediario(ss: SSOtica, cliente_id: str) -> list[dict]:
    """Títulos da aba Crediário: número, venda, filial e cada parcela com a situação."""
    r = ss._req("GET", f"{BASE_URL}/cadastro/cliente/{cliente_id}/detalhe/crediario")
    soup = BeautifulSoup(r.text, "lxml")
    titulos = []
    for corpo in soup.select('[id^="titulo_"]'):
        painel = corpo.find_parent(class_="panel")
        if painel is None or painel.select_one(".panel-heading") is None:
            continue
        cab = _texto(painel.select_one(".panel-heading"))
        m_t = re.search(r"T[íi]tulo\s+(\d+)", cab)
        m_v = re.search(r"Venda No\.\s*(\d+)", cab)
        filial = None
        for dt in corpo.find_all("dt"):
            if _texto(dt) == "Filial":
                dd = dt.find_next_sibling("dd")
                filial = _texto(dd) if dd else None
                break
        parcelas = []
        for tr in corpo.select(".table-responsive-vendas tbody > tr"):
            if "collapse" in (tr.get("class") or []):
                continue
            tds = tr.find_all("td", recursive=False)
            if len(tds) < 4 or not _texto(tds[1]).isdigit():
                continue
            rot = tds[0].find(["label", "button"])
            situacao = (_texto(rot) if rot else _texto(tds[0])).split(" Selecione")[0].strip()
            resto = " ".join(_texto(td) for td in tds[4:])
            mc = re.search(r"Cancelada em (\d{2}/\d{2}/\d{4})", resto)
            parcelas.append({
                "n": int(_texto(tds[1])),
                "situacao": situacao,
                "vencimento": _data_br(_texto(tds[2])),
                "valor": _valor_br(_texto(tds[3])),
                "cancelada_em": _data_br(mc.group(1)) if mc else None,
            })
        titulos.append({
            "titulo": int(m_t.group(1)) if m_t else None,
            "venda": int(m_v.group(1)) if m_v else None,
            "filial": filial,
            "parcelas": parcelas,
        })
    return titulos


# ---------------------------------------------------------------------------
# Banco
# ---------------------------------------------------------------------------

def _get(url: str, chave: str, tabela: str, params: dict) -> list[dict]:
    h = {"apikey": chave, "Authorization": f"Bearer {chave}"}
    r = requests.get(f"{url}/rest/v1/{tabela}", headers=h, params=params, timeout=120)
    r.raise_for_status()
    return r.json()


def abertas_no_app(url: str, chave: str, lojas: list[str]) -> list[dict]:
    lista = ",".join('"' + l + '"' for l in lojas)
    status = ",".join('"' + s + '"' for s in STATUS_EM_ABERTO)
    linhas, ultimo = [], 0
    while True:
        lote = _get(url, chave, "BANCO_DADOS", {
            "select": "id_parcela,documento,nome_da_loja,numero_titulo,venda_n,parcela,"
                      "data_vencimento,valor_original,status",
            "nome_da_loja": f"in.({lista})", "status": f"in.({status})",
            "id_parcela": f"gt.{ultimo}", "order": "id_parcela", "limit": "1000",
        })
        linhas += lote
        if len(lote) < 1000:
            return linhas
        ultimo = lote[-1]["id_parcela"]


def outra_linha_no_app(url: str, chave: str, p: dict, numero: int) -> bool:
    """Já existe no app outra linha com esse título/venda e parcela na loja?"""
    return bool(_get(url, chave, "BANCO_DADOS", {
        "select": "id_parcela", "nome_da_loja": f"eq.{p['nome_da_loja']}",
        "parcela": f"eq.{p['parcela']}", "id_parcela": f"neq.{p['id_parcela']}",
        "or": f"(numero_titulo.eq.{numero},venda_n.eq.{numero})", "limit": "1",
    }))


# ---------------------------------------------------------------------------
# Conferência
# ---------------------------------------------------------------------------

def _mesma_loja(filial: str | None, loja: str) -> bool:
    return bool(filial) and (filial == loja or (filial in MESMA_EMPRESA and loja in MESMA_EMPRESA))


def conferir(p: dict, titulos: list[dict], url: str, chave: str) -> dict:
    numero = p["numero_titulo"] or p["venda_n"]
    valor = float(p["valor_original"] or 0)
    cand = [(t, q) for t in titulos if _mesma_loja(t["filial"], p["nome_da_loja"])
            and (numero is None or numero in (t["titulo"], t["venda"]))
            for q in t["parcelas"] if q["n"] == p["parcela"]]
    exato = [(t, q) for t, q in cand if q["vencimento"] == p["data_vencimento"]
             and q["valor"] is not None and abs(q["valor"] - valor) < 0.01]
    if not exato:
        return {"categoria": "SEM_PAR_NA_SSOTICA",
                "obs": "; ".join(f"título {t['titulo']} p{q['n']} {q['situacao']} venc {q['vencimento']} R$ {q['valor']}"
                                 for t, q in cand[:3])}
    if len(exato) > 1:
        return {"categoria": "AMBIGUO", "obs": ", ".join(q["situacao"] for _, q in exato)}
    t, q = exato[0]
    base = {"titulo_ssotica": t["titulo"], "situacao_ssotica": q["situacao"], "cancelada_em": q["cancelada_em"]}
    if numero is None and outra_linha_no_app(url, chave, p, t["titulo"] or t["venda"]):
        return {**base, "categoria": "CONFLITO", "obs": "outra linha do app já tem esse título/parcela"}
    if q["situacao"].lower() == "cancelado":
        return {**base, "categoria": "A_CANCELAR"}
    if "spc" in q["situacao"].lower():
        return {**base, "categoria": "SPC"}
    return {**base, "categoria": "OUTRA_SITUACAO"}


def _br(d: str | None) -> str:
    return f"{d[8:10]}/{d[5:7]}/{d[0:4]}" if d else "?"


def gravar(url: str, chave: str, linhas: list[dict]) -> None:
    alvo = [l for l in linhas if l["categoria"] == "A_CANCELAR"]
    if not alvo:
        log.info("Nada a cancelar no app.")
        return
    h = {"apikey": chave, "Authorization": f"Bearer {chave}", "Content-Type": "application/json"}
    hoje = date.today().strftime("%d/%m/%Y")
    total = {"parcelas": 0, "vendas": 0, "visitas": 0}
    for i in range(0, len(alvo), 300):
        itens = [{"id_parcela": int(l["id_parcela"]),
                  "motivo": f"SSÓtica: parcela {l['parcela']} do título {l['titulo_ssotica']} ({l['nome_da_loja']}) "
                            f"cancelada na loja em {_br(l['cancelada_em'])}; conferido na ficha do cliente em {hoje}"}
                 for l in alvo[i:i + 300]]
        r = requests.post(f"{url}/rest/v1/rpc/cancelar_parcelas_ssotica", headers=h,
                          json={"p_itens": itens}, timeout=120)
        if r.status_code >= 400:
            raise RuntimeError(f"cancelar_parcelas_ssotica falhou ({r.status_code}): {r.text[:500]}")
        res = r.json()
        for k in total:
            total[k] += res.get(k, 0)
        for ig in res.get("ignoradas") or []:
            log.warning("Parcela %s ignorada: %s", ig.get("id_parcela"), ig.get("motivo"))
    log.info("Gravado no app: %d parcelas canceladas (%d vendas, %d visitas canceladas)",
             total["parcelas"], total["vendas"], total["visitas"])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gravar", action="store_true", help="cancela no app as confirmadas (sem isto, só o CSV)")
    args = ap.parse_args()

    SAIDA.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout),
                  logging.FileHandler(SAIDA / "sumidas_ssotica.log", encoding="utf-8")],
    )
    limite = time.time() - DIAS_GUARDAR * 86400
    for velho in SAIDA.glob("sumidas_ssotica_*.csv"):
        if velho.stat().st_mtime < limite:
            velho.unlink()

    arq_ids = SAIDA / ARQUIVO_IDS
    if not arq_ids.exists():
        log.error("%s não existe: rode antes o contas_receber_ssotica.py --app (todas as lojas).", arq_ids)
        return 1
    ids = json.loads(arq_ids.read_text(encoding="utf-8"))
    if ids["gerado_em"][:10] != date.today().isoformat():
        log.error("%s é de %s, não de hoje: o contas a receber de hoje não terminou. Nada conferido.",
                  arq_ids, ids["gerado_em"])
        return 1
    no_relatorio = {loja: set(v) for loja, v in ids["lojas"].items()}

    url, chave = config_supabase()
    abertas = abertas_no_app(url, chave, sorted(no_relatorio))
    sumidas = [p for p in abertas if p["id_parcela"] not in no_relatorio[p["nome_da_loja"]]]
    log.info("%d parcelas em aberto no app; %d não vieram no relatório de hoje", len(abertas), len(sumidas))
    if len(sumidas) > LIMITE_SUMIDAS:
        log.error("Sumidas demais (%d > %d): relatório provavelmente incompleto. Nada conferido.",
                  len(sumidas), LIMITE_SUMIDAS)
        return 1

    ss = SSOtica(*credenciais_ssotica())
    ss.login()
    fichas: dict[str, list[dict] | None] = {}
    linhas = []
    for p in sorted(sumidas, key=lambda x: x["documento"] or ""):
        doc = p["documento"]
        if not doc:
            res = {"categoria": "SEM_DOCUMENTO"}
        else:
            if doc not in fichas:
                cids = buscar_clientes(ss, doc)
                fichas[doc] = [t for cid in cids for t in crediario(ss, cid)] if cids else None
            res = ({"categoria": "CLIENTE_NAO_ENCONTRADO"} if fichas[doc] is None
                   else conferir(p, fichas[doc], url, chave))
        linhas.append({
            "categoria": res["categoria"], "id_parcela": p["id_parcela"], "nome_da_loja": p["nome_da_loja"],
            "numero_titulo": p["numero_titulo"], "venda_n": p["venda_n"], "parcela": p["parcela"],
            "vencimento": p["data_vencimento"], "valor_original": p["valor_original"], "status_app": p["status"],
            "titulo_ssotica": res.get("titulo_ssotica"), "situacao_ssotica": res.get("situacao_ssotica"),
            "cancelada_em": res.get("cancelada_em"), "obs": res.get("obs", ""), "documento": doc,
        })
    log.info("%d clientes conferidos na SSÓtica", len(fichas))

    cont = collections.Counter(l["categoria"] for l in linhas)
    log.info("Resultado: %s", dict(cont) or "nada sumido")
    if linhas:
        rel = SAIDA / f"sumidas_ssotica_{datetime.now():%Y%m%d_%H%M}.csv"
        with rel.open("w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=list(linhas[0]), delimiter=";")
            w.writeheader()
            w.writerows(linhas)
        log.info("Relatório: %s", rel)

    if args.gravar:
        gravar(url, chave, linhas)
    else:
        log.info("Modo relatório: nada foi gravado (use --gravar para cancelar no app).")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except BaseException:
        log.exception("Falhou")
        sys.exit(1)
