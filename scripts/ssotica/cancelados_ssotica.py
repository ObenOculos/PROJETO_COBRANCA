#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Vendas canceladas na SSÓtica x parcelas em aberto no Sistema de Cobrança.

A SSÓtica não tem API. O script faz o que a tela faz, sem navegador:
login (formulário Laravel com _token, sem captcha) -> para cada loja, POST
no filtro de vendas com Situação = Cancelada e período "Tudo" -> segue a
paginação (?page=N) -> lê os cards (cada card traz as parcelas do crediário
com a situação de cada uma: Pago, Cancelado, ...).

Depois compara com BANCO_DADOS (loja + nº da venda + nº da parcela, conferindo
o vencimento) e gera um relatório. Sem --gravar é SÓ LEITURA. Com --gravar,
chama a função cancelar_parcelas_ssotica (migration 20261111000006), que
cancela só as parcelas que a SSÓtica marcou como Cancelado -- parcela paga
fica Pago -- e registra cada venda em vendas_canceladas.

Credenciais: SSO_EMAIL / SSO_PASSWORD, lidas das variáveis de ambiente ou
do .env dos scripts da SSÓtica (mesmo arquivo usado pelo credentials.py de
lá; caminho em SSOTICA_ENV_PATH, pode ser trocado pela variável de ambiente
SSOTICA_ENV). Banco: VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env
deste repositório.

Saída (pasta saida/, fora do git -- tem nome e CPF de cliente):
  - ssotica_canceladas_<data>.json  : o que foi lido da SSÓtica (cache)
  - relatorio_cancelados_<data>.csv : uma linha por parcela comparada

Uso:
    python scripts/ssotica/cancelados_ssotica.py                  # lê a SSÓtica e compara (só relatório)
    python scripts/ssotica/cancelados_ssotica.py --gravar         # ... e cancela no app
    python scripts/ssotica/cancelados_ssotica.py --loja PwrbRL    # uma loja só
    python scripts/ssotica/cancelados_ssotica.py --cache saida/ssotica_canceladas_<data>.json
                                                                  # compara de novo sem ler a SSÓtica
"""
import argparse
import csv
import json
import logging
import math
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup

AQUI = Path(__file__).resolve().parent
REPO = AQUI.parent.parent
SAIDA = AQUI / "saida"
DIAS_GUARDAR = 30

SSOTICA_ENV_PATH = Path(
    os.getenv("SSOTICA_ENV")
    or r"C:\Users\User\Documents\Empresa_Oben\Financeiro\Despesas_e_Receitas\SSÓTICA\Código_Óticas\.env"
)
COBRANCA_ENV_PATH = REPO / ".env"

BASE_URL = "https://app.ssotica.com.br"

# Código da empresa na SSÓtica -> nome(s) da loja em BANCO_DADOS.nome_da_loja.
# PzBXYZ: a mesma empresa foi "Itapipoca Ext" e virou "Messejana" (numeração
# de venda contínua: Itapipoca Ext 1-2189, Messejana 2192+), por isso os dois.
# Exxlab e Amontada não têm parcelas no app hoje; ficam na varredura para
# aparecerem no relatório se um dia forem importadas.
LOJAS: dict[str, list[str]] = {
    "PwrbRL": ["Excellence Óticas - Eusebio"],
    "PzBXYZ": ["Excellence Óticas - Messejana", "Oticas Luana Itapipoca Ext"],
    "PDANkX": ["Exxlab"],
    "PrXvgx": ["Oticas Luana - Amontada"],
    "LOpApm": ["Oticas Luana - Poranga"],
    "LQobRo": ["Oticas Luana - Quiterionopolis"],
    "LDAdyO": ["Oticas Luana Crateus"],
    "PKrOJP": ["Oticas Luana Crateus Ext"],
    "PKKWkj": ["Oticas Luana Independencia"],
    "PbllBO": ["Oticas Luana Itapipoca"],
    "MWbgWv": ["Oticas Luana Novo Oriente"],
}

STATUS_FECHADOS_APP = {"pago", "cancelado"}
LOTE_VENDAS = 150  # vendas por consulta ao banco (filtro in.(...) na URL)

log = logging.getLogger("cancelados_ssotica")


# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------

def ler_env(caminho: Path) -> dict:
    valores = {}
    if caminho.exists():
        for linha in caminho.read_text(encoding="utf-8-sig").splitlines():
            linha = linha.strip()
            if not linha or linha.startswith("#") or "=" not in linha:
                continue
            k, v = linha.split("=", 1)
            valores[k.strip()] = v.strip().strip('"').strip("'")
    return valores


def credenciais_ssotica() -> tuple[str, str]:
    arq = ler_env(SSOTICA_ENV_PATH)
    email = os.getenv("SSO_EMAIL") or arq.get("SSO_EMAIL")
    senha = os.getenv("SSO_PASSWORD") or arq.get("SSO_PASSWORD")
    if not email or not senha:
        sys.exit(f"Credenciais da SSÓtica não encontradas (SSO_EMAIL/SSO_PASSWORD em {SSOTICA_ENV_PATH}).")
    return email, senha


def config_supabase() -> tuple[str, str]:
    arq = ler_env(COBRANCA_ENV_PATH)
    url = os.getenv("VITE_SUPABASE_URL") or arq.get("VITE_SUPABASE_URL")
    chave = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or arq.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not chave:
        sys.exit(f"VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não encontrados em {COBRANCA_ENV_PATH}.")
    return url.rstrip("/"), chave


# ---------------------------------------------------------------------------
# SSÓtica
# ---------------------------------------------------------------------------

def _texto(el) -> str:
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip() if el else ""


def _token(html: str) -> str:
    m = re.search(r'name="_token"[^>]*value="([^"]+)"', html) or re.search(
        r'value="([^"]+)"[^>]*name="_token"', html
    )
    if not m:
        raise RuntimeError("Não achei o _token (CSRF) na página da SSÓtica.")
    return m.group(1)


class SSOtica:
    def __init__(self, email: str, senha: str):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
        )
        self.email = email
        self.senha = senha

    def _req(self, metodo: str, url: str, **kw) -> requests.Response:
        for tentativa in range(1, 4):
            try:
                r = self.s.request(metodo, url, timeout=120, **kw)
                r.raise_for_status()
                return r
            except requests.RequestException as e:
                if tentativa == 3:
                    raise
                log.warning("Falha em %s (%s), tentativa %d/3", url.split("?")[0], e, tentativa)
                time.sleep(5 * tentativa)
        raise AssertionError

    def login(self) -> None:
        r = self._req("GET", f"{BASE_URL}/login")
        r = self._req(
            "POST",
            f"{BASE_URL}/login",
            data={"_token": _token(r.text), "email": self.email, "password": self.senha},
        )
        if urlsplit(r.url).path.rstrip("/") == "/login" or 'id="senha"' in r.text:
            raise RuntimeError("Login na SSÓtica recusado (confira SSO_EMAIL/SSO_PASSWORD).")
        log.info("Login na SSÓtica ok")

    def canceladas(self, loja: str) -> tuple[list[dict], int | None]:
        """Todas as vendas canceladas da loja (período Tudo). Devolve (vendas, total informado pela tela)."""
        url = f"{BASE_URL}/movimentacao/vendas/{loja}/listar"
        pagina = self._req("GET", url)
        if 'id="formFilter"' not in pagina.text:
            raise RuntimeError(f"Tela de vendas da loja {loja} não abriu (sessão caiu?).")
        dados = {
            "_token": _token(pagina.text),
            "clearFilter": "0",
            "filterForm[filtroAvancado]": "1",
            "filterForm[empresa]": loja,
            "filterForm[nsa_venda]": "",
            "filterForm[periodo][periodo]": "TUDO",
            "filterForm[periodo][inicio]": "01/01/2000",
            "filterForm[periodo][fim]": "31/12/2099",
            "filterForm[situacao][]": "CANCELADO",
            "filterForm[searchTerm]": "",
        }
        r = self._req("POST", url, data=dados)
        soup = BeautifulSoup(r.text, "lxml")
        vendas = parse_cards(soup)
        total = _total_vendas(soup)
        links = [a.get("href") for a in soup.select(".inner-paginacao a") if a.get("href")]
        if links and vendas:
            n_paginas = math.ceil(total / len(vendas)) if total else max(
                (int(t) for t in (_texto(a) for a in soup.select(".inner-paginacao a")) if t.isdigit()),
                default=1,
            )
            for pg in range(2, n_paginas + 1):
                rp = self._req("GET", _com_pagina(links[0], pg))
                novas = parse_cards(BeautifulSoup(rp.text, "lxml"))
                if not novas:
                    break
                vendas.extend(novas)
        return vendas, total


def _com_pagina(href: str, pagina: int) -> str:
    p = urlsplit(href if href.startswith("http") else BASE_URL + href)
    q = dict(parse_qsl(p.query))
    q["page"] = str(pagina)
    return urlunsplit((p.scheme, p.netloc, p.path, urlencode(q), ""))


def _total_vendas(soup) -> int | None:
    for w in soup.select("#quadro-resumo .widget-2"):
        if "Número de Vendas" in _texto(w):
            h2 = w.find("h2")
            t = re.sub(r"\D", "", _texto(h2))
            return int(t) if t else None
    return None


def _data_br(s: str) -> str | None:
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", s or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def _valor_br(s: str) -> float | None:
    m = re.search(r"-?[\d.]+,\d{2}", s or "")
    return float(m.group(0).replace(".", "").replace(",", ".")) if m else None


def parse_cards(soup) -> list[dict]:
    vendas = []
    for card in soup.select("li.card-principal"):
        carrinho = card.select_one("i.fa-shopping-cart")
        numero = re.sub(r"\D", "", _texto(carrinho.parent)) if carrinho else ""
        if not numero:
            continue
        data_venda = None
        cal = card.select_one("i.fa-calendar")
        if cal:
            data_venda = _data_br(_texto(cal.parent))

        canc_data = canc_por = canc_motivo = None
        ic = card.select_one("i.fa-calendar-times-o")
        if ic:
            bloco = ic.find_parent("span") or ic.parent
            canc_data = _data_br(_texto(bloco))
            iu = bloco.select_one("i.fa-user-times")
            if iu:
                partes = []
                for irmao in iu.next_siblings:
                    if getattr(irmao, "name", None) in ("div", "i"):
                        break
                    partes.append(irmao.get_text(" ", strip=True) if hasattr(irmao, "get_text") else str(irmao))
                canc_por = re.sub(r"\s+", " ", " ".join(partes)).strip() or None
            mot = bloco.select_one(".text-danger")
            canc_motivo = _texto(mot) or None

        parcelas = []
        for aba in card.select('[id^="tabVendaCrediario"]'):
            for tr in aba.select("tbody > tr"):
                if "collapse" in (tr.get("class") or []):
                    continue
                tds = tr.find_all("td", recursive=False)
                if len(tds) < 4:
                    continue
                n = _texto(tds[1])
                if not n.isdigit():
                    continue
                rot = tds[0].find(["label", "button"])
                situacao = _texto(rot) if rot else _texto(tds[0])
                parcelas.append({
                    "n": int(n),
                    "situacao": situacao,
                    "vencimento": _data_br(_texto(tds[2])),
                    "valor": _valor_br(_texto(tds[3])),
                })

        vendas.append({
            "id": card.get("id"),
            "venda": int(numero),
            "cliente": _texto(card.select_one("a.viewclient")) or None,
            "data_venda": data_venda,
            "cancelada_em": canc_data,
            "cancelada_por": canc_por,
            "motivo": canc_motivo,
            "parcelas": parcelas,
        })
    return vendas


# ---------------------------------------------------------------------------
# Banco (só leitura)
# ---------------------------------------------------------------------------

def parcelas_no_app(url: str, chave: str, nomes_loja: list[str], vendas: list[int]) -> list[dict]:
    h = {"apikey": chave, "Authorization": f"Bearer {chave}"}
    campos = ("id_parcela,nome_da_loja,venda_n,numero_titulo,parcela,data_vencimento,"
              "valor_original,valor_recebido,status,situacao,documento,cliente")
    lojas = ",".join('"' + n.replace('"', '\\"') + '"' for n in nomes_loja)
    out = []
    for i in range(0, len(vendas), LOTE_VENDAS):
        lote = ",".join(str(v) for v in vendas[i:i + LOTE_VENDAS])
        offset = 0
        while True:
            r = requests.get(
                f"{url}/rest/v1/BANCO_DADOS",
                headers=h,
                params={
                    "select": campos,
                    "nome_da_loja": f"in.({lojas})",
                    "venda_n": f"in.({lote})",
                    "order": "id_parcela",
                    "limit": "1000",
                    "offset": str(offset),
                },
                timeout=60,
            )
            r.raise_for_status()
            linhas = r.json()
            out.extend(linhas)
            if len(linhas) < 1000:
                break
            offset += 1000
    return out


# ---------------------------------------------------------------------------
# Comparação
# ---------------------------------------------------------------------------

CATEGORIAS = {
    "A_CANCELAR": "Cancelada na SSÓtica, em aberto no app -> cancelar",
    "VENC_DIFERENTE": "Cancelada na SSÓtica, em aberto no app, vencimento e valor não batem -> conferir",
    "PAGTO_APOS_CANCELAMENTO": "Cancelada na SSÓtica, mas há pagamento no app depois da data do cancelamento -> conferir (não grava)",
    "PAGA_NO_APP": "Cancelada na SSÓtica, mas Paga no app -> conferir (não mexer)",
    "JA_CANCELADA": "Já cancelada no app",
    "NAO_CANCELADA_NA_SSOTICA": "Venda cancelada, mas esta parcela não está Cancelado na SSÓtica (ex.: paga antes) -> manter",
    "SEM_PARCELA_NA_SSOTICA": "Parcela do app sem parcela de mesmo nº no card da SSÓtica -> conferir",
}


def comparar(loja: str, vendas_ss: list[dict], app: list[dict]) -> list[dict]:
    por_venda = {v["venda"]: v for v in vendas_ss}
    linhas = []
    for p in app:
        v = por_venda.get(p["venda_n"])
        if not v:
            continue
        candidatas = [x for x in v["parcelas"] if x["n"] == p["parcela"]]
        ss = next((x for x in candidatas if x["vencimento"] == p["data_vencimento"]), None) or (
            candidatas[0] if candidatas else None
        )
        st_app = (p["status"] or "").strip().lower()
        obs = ""
        if not ss:
            cat = "SEM_PARCELA_NA_SSOTICA"
        elif ss["situacao"].lower() != "cancelado":
            cat = "NAO_CANCELADA_NA_SSOTICA"
        elif st_app == "cancelado":
            cat = "JA_CANCELADA"
        elif st_app == "pago":
            cat = "PAGA_NO_APP"
        elif ss["vencimento"] == p["data_vencimento"]:
            cat = "A_CANCELAR"
        elif ss["valor"] is not None and abs(ss["valor"] - float(p["valor_original"] or 0)) < 0.01:
            # Mesma parcela (nº e valor), vencimento prorrogado na SSÓtica e
            # não reimportado no app (visto em 2026-11-11: +1 mês na parcela 1).
            cat = "A_CANCELAR"
            obs = "vencimento diferente (prorrogado na SSÓtica), mesmo valor"
        else:
            cat = "VENC_DIFERENTE"
        aberto = (p["valor_original"] or 0) - (p["valor_recebido"] or 0)
        linhas.append({
            "categoria": cat,
            "loja_ssotica": loja,
            "nome_da_loja": p["nome_da_loja"],
            "venda": p["venda_n"],
            "parcela": p["parcela"],
            "id_parcela": p["id_parcela"],
            "status_app": p["status"],
            "situacao_app": p["situacao"],
            "situacao_ssotica": ss["situacao"] if ss else "",
            "vencimento_app": p["data_vencimento"],
            "vencimento_ssotica": ss["vencimento"] if ss else "",
            "valor_original": p["valor_original"],
            "valor_recebido": p["valor_recebido"],
            "valor_em_aberto": round(aberto, 2),
            "cancelada_em": v["cancelada_em"],
            "cancelada_por": v["cancelada_por"],
            "motivo": v["motivo"],
            "obs": obs,
            "documento": p["documento"],
            "cliente": p["cliente"],
        })
    return linhas


def marcar_pagamento_apos_cancelamento(url: str, chave: str, linhas: list[dict]) -> None:
    """Venda com pagamento lançado no app DEPOIS da data do cancelamento na
    SSÓtica não é cancelada automaticamente (ex.: renegociação no Cedrus).
    Visto em 2026-11-11: Messejana 2865, cancelada 16/08, pagamentos 02/09 e 05/10."""
    alvo = [l for l in linhas if l["categoria"] == "A_CANCELAR"]
    docs = sorted({l["documento"] for l in alvo if l["documento"]})
    h = {"apikey": chave, "Authorization": f"Bearer {chave}"}
    pagos: dict[tuple[str, str], str] = {}  # (documento, venda) -> última data de pagamento
    for i in range(0, len(docs), 100):
        lista = ",".join('"' + d + '"' for d in docs[i:i + 100])
        offset = 0
        while True:
            r = requests.get(
                f"{url}/rest/v1/sale_payments",
                headers=h,
                params={"select": "client_document,sale_number,payment_date",
                        "client_document": f"in.({lista})", "order": "id",
                        "limit": "1000", "offset": str(offset)},
                timeout=60,
            )
            r.raise_for_status()
            rows = r.json()
            for pg in rows:
                k = (pg["client_document"], str(pg["sale_number"]))
                d = (pg["payment_date"] or "")[:10]
                if d > pagos.get(k, ""):
                    pagos[k] = d
            if len(rows) < 1000:
                break
            offset += 1000
    for l in alvo:
        ultimo = pagos.get((l["documento"], str(l["venda"])))
        if ultimo and l["cancelada_em"] and ultimo > l["cancelada_em"]:
            l["categoria"] = "PAGTO_APOS_CANCELAMENTO"
            l["obs"] = f"pagamento no app em {ultimo}"


def _br(d: str | None) -> str:
    return f"{d[8:10]}/{d[5:7]}/{d[0:4]}" if d else "?"


def gravar(url: str, chave: str, linhas: list[dict]) -> None:
    alvo = [l for l in linhas if l["categoria"] == "A_CANCELAR"]
    if not alvo:
        log.info("Nada a cancelar no app.")
        return
    por_venda: dict[tuple, list[dict]] = {}
    for l in alvo:
        por_venda.setdefault((l["nome_da_loja"], l["venda"]), []).append(l)
    h = {"apikey": chave, "Authorization": f"Bearer {chave}", "Content-Type": "application/json"}
    lote: list[dict] = []
    total = {"parcelas": 0, "vendas": 0, "visitas": 0, "ignoradas": 0}

    def enviar() -> None:
        if not lote:
            return
        r = requests.post(f"{url}/rest/v1/rpc/cancelar_parcelas_ssotica",
                          headers=h, json={"p_itens": lote}, timeout=120)
        if r.status_code >= 400:
            raise RuntimeError(f"cancelar_parcelas_ssotica falhou ({r.status_code}): {r.text[:500]}")
        res = r.json()
        for k in ("parcelas", "vendas", "visitas"):
            total[k] += res.get(k, 0)
        ign = res.get("ignoradas") or []
        total["ignoradas"] += len(ign)
        for i in ign:
            log.warning("Parcela %s ignorada: %s", i.get("id_parcela"), i.get("motivo"))
        lote.clear()

    # Uma venda nunca é dividida entre dois lotes (o registro em
    # vendas_canceladas é por venda e por chamada).
    for (loja, venda), ps in por_venda.items():
        v = ps[0]
        motivo = (f"SSÓtica: venda {venda} ({loja}) cancelada em {_br(v['cancelada_em'])}"
                  f" por {v['cancelada_por'] or '?'}"
                  + (f" - {v['motivo']}" if v["motivo"] else ""))
        if len(lote) + len(ps) > 300:
            enviar()
        lote.extend({"id_parcela": int(p["id_parcela"]), "motivo": motivo} for p in ps)
    enviar()
    log.info("Gravado no app: %d parcelas canceladas, %d vendas registradas, %d visitas canceladas, %d ignoradas",
             total["parcelas"], total["vendas"], total["visitas"], total["ignoradas"])


# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--loja", action="append", help="código da loja na SSÓtica (pode repetir); padrão: todas")
    ap.add_argument("--cache", type=Path, help="usar um JSON já lido em vez de acessar a SSÓtica")
    ap.add_argument("--gravar", action="store_true",
                    help="cancela no app as parcelas A_CANCELAR (sem isto, só gera o relatório)")
    args = ap.parse_args()

    SAIDA.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout),
                  logging.FileHandler(SAIDA / "cancelados_ssotica.log", encoding="utf-8")],
    )
    carimbo = datetime.now().strftime("%Y%m%d_%H%M")
    # Rodando todo dia (Agendador), cada leitura deixa ~3 MB de JSON + CSV:
    # guarda só os últimos DIAS_GUARDAR dias.
    limite = time.time() - DIAS_GUARDAR * 86400
    for velho in [*SAIDA.glob("ssotica_canceladas_*.json"), *SAIDA.glob("relatorio_cancelados_*.csv")]:
        if velho.stat().st_mtime < limite:
            velho.unlink()
    lojas = args.loja or list(LOJAS)
    for cod in lojas:
        if cod not in LOJAS:
            sys.exit(f"Loja desconhecida: {cod}. Conhecidas: {', '.join(LOJAS)}")

    if args.cache:
        lido = json.loads(args.cache.read_text(encoding="utf-8"))
    else:
        ss = SSOtica(*credenciais_ssotica())
        ss.login()
        lido = {}
        for cod in lojas:
            t0 = time.time()
            vendas, total = ss.canceladas(cod)
            lido[cod] = {"total_tela": total, "vendas": vendas}
            aviso = "" if total in (None, len(vendas)) else f"  <-- ATENÇÃO: a tela diz {total}"
            log.info("%s %-32s %4d vendas canceladas (%.0fs)%s",
                     cod, LOJAS[cod][0], len(vendas), time.time() - t0, aviso)
        arq = SAIDA / f"ssotica_canceladas_{carimbo}.json"
        arq.write_text(json.dumps(lido, ensure_ascii=False, indent=1), encoding="utf-8")
        log.info("Leitura salva em %s", arq)

    url, chave = config_supabase()
    todas: list[dict] = []
    for cod in lojas:
        if cod not in lido:
            continue
        vendas_ss = lido[cod]["vendas"]
        numeros = sorted({v["venda"] for v in vendas_ss})
        app = parcelas_no_app(url, chave, LOJAS[cod], numeros) if numeros else []
        todas.extend(comparar(cod, vendas_ss, app))
    marcar_pagamento_apos_cancelamento(url, chave, todas)

    rel = SAIDA / f"relatorio_cancelados_{carimbo}.csv"
    campos = list(todas[0].keys()) if todas else ["categoria"]
    with rel.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=campos, delimiter=";")
        w.writeheader()
        w.writerows(todas)

    # Resumo
    print()
    print(f"{'Loja':<32} {'Categoria':<26} {'Parcelas':>8} {'Vendas':>7} {'Em aberto R$':>14}")
    chave_loja = lambda x: (x["nome_da_loja"], x["categoria"])
    grupos: dict = {}
    for l in todas:
        g = grupos.setdefault(chave_loja(l), {"p": 0, "v": set(), "aberto": 0.0})
        g["p"] += 1
        g["v"].add(l["venda"])
        g["aberto"] += l["valor_em_aberto"] if l["status_app"] not in ("Pago", "Cancelado") else 0
    for (loja, cat), g in sorted(grupos.items()):
        print(f"{loja:<32} {cat:<26} {g['p']:>8} {len(g['v']):>7} {g['aberto']:>14,.2f}")
    print()
    for cat, desc in CATEGORIAS.items():
        sel = [l for l in todas if l["categoria"] == cat]
        if sel:
            aberto = sum(l["valor_em_aberto"] for l in sel if l["status_app"] not in ("Pago", "Cancelado"))
            print(f"{cat:<26} {len(sel):>6} parcelas  {len({(l['nome_da_loja'], l['venda']) for l in sel}):>5} vendas"
                  f"  R$ {aberto:>12,.2f}  {desc}")
    print(f"\nRelatório: {rel}")

    if args.gravar:
        gravar(url, chave, todas)
    else:
        log.info("Modo relatório: nada foi gravado (use --gravar para cancelar no app).")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except BaseException:
        # Pelo Agendador ninguém vê o terminal: o erro tem de ir para o .log.
        log.exception("Falhou")
        sys.exit(1)
