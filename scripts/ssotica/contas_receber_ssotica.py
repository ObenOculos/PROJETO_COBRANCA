#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Contas a receber da SSÓtica -> planilhas BD_Contasareceber_*.xlsx (Power BI)
e, na etapa seguinte, -> BANCO_DADOS do Sistema de Cobrança.

Substitui, sem navegador, a cadeia que rodava toda noite em
Empresa_Oben\\Financeiro\\Despesas_e_Receitas\\SSÓTICA (tarefa "Python Óticas"):
  1. 11 scripts Selenium (1_Exxlab.py ... 11_Messejana.py): relatório
     Financeiro > Contas a receber, Situação = Em aberto + Pago, Tipo do
     período = Lançamento, exportado por ano;
  2. Download_Temporário\\Renomear_Aba_*.py: limpa a planilha, junta os anos,
     garante celular/email, tira linhas repetidas, aba "BD";
  3. Banco_Dados\\Organizar_Colunas.py: tira SUPRIMENTO/H-001, põe Apelido e
     CPF faltante (CLIENTES_E_APELIDO.xlsx do Dropbox), ordena as colunas;
  4. Banco_Dados\\Enviar_Para_Ciclone.py: copia para o \\\\ciclone (Power BI).
Os nomes de arquivo, as colunas e a aba continuam os mesmos.

Como a tela faz: GET no relatório (pega o formulário com o _token) -> POST do
filtro em /periodo/escolher-periodo -> GET em /exportar (devolve o .xlsx do
filtro guardado na sessão). Baixa por semestre (o Crateus Ext já precisava
disso por tamanho).

Uso:
    python scripts/ssotica/contas_receber_ssotica.py                    # todas as lojas -> saida/contas_receber/
    python scripts/ssotica/contas_receber_ssotica.py --loja LQobRo      # uma loja
    python scripts/ssotica/contas_receber_ssotica.py --destino "\\\\ciclone\\Power BI - FoccoBrasil\\Oticas Luana\\Contas a Receber"
"""
import argparse
import io
import json
import re
import logging
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import openpyxl
import pandas as pd
import requests
from bs4 import BeautifulSoup

from cancelados_ssotica import BASE_URL, SAIDA, SSOtica, config_supabase, credenciais_ssotica

log = logging.getLogger("contas_receber_ssotica")

DESTINO_PADRAO = SAIDA / "contas_receber"
DESTINO_POWER_BI = Path(r"\\ciclone\Power BI - FoccoBrasil\Oticas Luana\Contas a Receber")
ARQUIVO_APELIDOS = Path(
    r"C:\Users\User\Dropbox\5. DNA COBRANÇA GERAL\Cobrança_Focco\Arquivos_Atualizados"
    r"\4 - Relação_Óticas_CPF\CLIENTES_E_APELIDO.xlsx"
)


@dataclass
class Loja:
    cod: str            # empresa na SSÓtica
    arquivo: str        # nome do .xlsx (sem extensão)
    inicio: date        # 1º lançamento baixado
    fim: date | None = None          # último lançamento (None = hoje)
    nome: str | None = None          # sobrescreve "Nome da Loja"
    por_ano: bool = False            # um arquivo por ano (<arquivo>_<ano>.xlsx)
    app: bool = True                 # também vai para o Sistema de Cobrança


# Mesma configuração dos scripts antigos (START_YEAR / START_DATE / END_DATE).
# PzBXYZ é uma empresa só na SSÓtica que foi "Itapipoca Ext" e virou
# "Messejana": até 15/10/2025 vai para o arquivo da Itapipoca Ext (com o nome
# antigo), depois para o da Messejana. Os scripts antigos começavam a Messejana
# em 29/10/2025; aqui começa em 16/10 para não deixar buraco (o log avisa se
# houver lançamento nesse intervalo).
LOJAS_CR: list[Loja] = [
    Loja("PDANkX", "BD_Contasareceber_exxlab", date(2024, 1, 1), app=False),  # laboratório: só Power BI
    Loja("LOpApm", "BD_Contasareceber_LojaPoranga", date(2024, 1, 1)),
    Loja("LDAdyO", "BD_Contasareceber_lojaCrateus", date(2022, 1, 1)),
    Loja("PKrOJP", "BD_Contasareceber_ExternaCrateus", date(2021, 1, 1), por_ano=True),
    Loja("PKKWkj", "BD_Contasareceber_LojaIndependencia", date(2024, 1, 1)),
    Loja("PbllBO", "BD_Contasareceber_lojaItapipoca", date(2021, 1, 1)),
    Loja("PzBXYZ", "BD_Contasareceber_ExternaItapipoca", date(2022, 1, 1), fim=date(2025, 10, 15),
         nome="Oticas Luana Itapipoca Ext"),
    Loja("MWbgWv", "BD_Contasareceber_NovoOriente", date(2021, 1, 1)),
    Loja("PwrbRL", "BD_Contasareceber_LojaEusebio", date(2021, 1, 1)),
    Loja("LQobRo", "BD_Contasareceber_Quiterianopolis", date(2025, 1, 1)),
    Loja("PzBXYZ", "BD_Contasareceber_Messejana", date(2025, 10, 16)),
]

COLUNAS_PADRAO = [
    "Nome da Loja", "Data Lançamento", "Data Vencimento", "Valor Original", "Valor Reajustado",
    "Multa", "Juros por dia", "Multa aplicada", "Juros aplicado", "Valor Recebido",
    "Data de Recebimento", "Dias Em Atraso", "Dias Carência", "Desconto", "Acréscimo",
    "Multa Paga", "Juros Pago", "Tipo de Cobrança", "Número Titulo", "Parcela", "ID Parcela",
    "Status", "Cliente", "Apelido", "Documento", "Endereço", "Número", "Bairro", "Complemento",
    "CEP", "Cidade", "Estado", "Obs", "Código Externo", "Descrição", "Venda Nº", "Convenio",
    "telefone", "celular", "celular1", "celular2", "celular3", "email",
]
COLUNAS_TEXTO = [
    "Tipo de Cobrança", "Status", "Cliente", "Apelido", "Documento", "Endereço", "Número", "Bairro",
    "Complemento", "CEP", "Cidade", "Estado", "Obs", "Descrição", "telefone", "celular", "celular1",
    "celular2", "celular3", "email",
]
TITULOS_FORA = {"SUPRIMENTO", "H-001"}   # "Número Titulo" que não é conta a receber


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def _campos_do_form(form) -> list[tuple[str, str]]:
    """O que o navegador enviaria do formulário (inputs + opções selecionadas)."""
    campos = []
    for el in form.find_all(["input", "select", "textarea"]):
        nome = el.get("name")
        if not nome or el.get("type") in ("submit", "button", "file"):
            continue
        if el.name == "select":
            for op in el.find_all("option"):
                if op.has_attr("selected"):
                    campos.append((nome, op.get("value", "")))
        elif el.get("type") in ("checkbox", "radio"):
            if el.has_attr("checked"):
                campos.append((nome, el.get("value", "on")))
        else:
            campos.append((nome, el.get("value", "")))
    return campos


SEM_REGISTROS = ("nenhum registro", "nenhum resultado", "nenhuma conta", "não há", "nao ha",
                 "sem registros", "nada encontrado", "não foram encontrad", "nenhum dado",
                 "number of sheets is 0")  # relatório vazio: "...out of bounds index: 0. The actual number of sheets is 0."


def exportar(ss: SSOtica, cod: str, ini: date, fim: date,
             situacoes: tuple[str, ...] = ("AP", "PG")) -> bytes | None:
    base = f"{BASE_URL}/relatorios/{cod}/financeiro/contas-a-receber"
    pagina = ss._req("GET", base)
    form = BeautifulSoup(pagina.text, "lxml").find("form", id="formFilter")
    if form is None:
        raise RuntimeError(f"Relatório de contas a receber da loja {cod} não abriu (sessão caiu?).")
    trocar = {"filterForm[situacao][]", "filterForm[tipoPeriodo]", "filterForm[groupBy]",
              "filterForm[empresa]", "filterForm[inicioPeriodo]", "filterForm[fimPeriodo]", "comando"}
    dados = [(k, v) for k, v in _campos_do_form(form) if k not in trocar]
    dados += [
        ("filterForm[empresa]", cod),
        # AP = Em aberto, PG = Pago (as outras opções do filtro: RE, MjlVAL)
        *[("filterForm[situacao][]", sit) for sit in situacoes],
        ("filterForm[tipoPeriodo]", "L"),        # Lançamento
        ("filterForm[groupBy]", "vendedor"),     # Vendedor >> Formas de Pagamento
        ("filterForm[inicioPeriodo]", ini.strftime("%d/%m/%Y")),
        ("filterForm[fimPeriodo]", fim.strftime("%d/%m/%Y")),
        ("comando", "screen"),
    ]
    ss._req("POST", f"{base}/periodo/escolher-periodo", data=dados)
    r = ss._req("GET", f"{base}/exportar")
    if r.content.startswith(b"PK"):
        return r.content
    # Período sem lançamentos: a SSÓtica devolve a página em vez da planilha.
    SAIDA.mkdir(parents=True, exist_ok=True)
    pagina_erro = SAIDA / f"exportacao_{cod}_{ini:%Y%m%d}_{fim:%Y%m%d}.html"
    pagina_erro.write_bytes(r.content)
    texto = BeautifulSoup(r.text, "lxml").get_text(" ", strip=True).lower()
    if any(m in texto for m in SEM_REGISTROS):
        log.info("   %s %s..%s: sem lançamentos", cod, ini, fim)
        pagina_erro.unlink()
        return None
    raise RuntimeError(f"Exportação da loja {cod} ({ini}..{fim}) não veio como planilha "
                       f"(content-type {r.headers.get('content-type')}). Página salva em {pagina_erro}")


def semestres(ini: date, fim: date) -> list[tuple[date, date]]:
    faixas = []
    for ano in range(ini.year, fim.year + 1):
        for a, b in ((date(ano, 1, 1), date(ano, 6, 30)), (date(ano, 7, 1), date(ano, 12, 31))):
            a, b = max(a, ini), min(b, fim)
            if a <= b:
                faixas.append((a, b))
    return faixas


def ler_planilha(conteudo: bytes) -> pd.DataFrame:
    """Planilha exportada -> DataFrame com o cabeçalho certo (a exportação
    traz linhas de título antes do cabeçalho)."""
    wb = openpyxl.load_workbook(io.BytesIO(conteudo), read_only=True, data_only=True)
    linhas = [list(r) for r in wb.active.iter_rows(values_only=True)]
    wb.close()
    i_cab = next((i for i, r in enumerate(linhas)
                  if any(str(c).strip() == "ID Parcela" for c in r if c is not None)), None)
    if i_cab is None:
        if not any(any(c not in (None, "") for c in r) for r in linhas):
            return pd.DataFrame()
        raise RuntimeError("Planilha da SSÓtica sem a coluna 'ID Parcela' (formato mudou?).")
    cab = [str(c).strip() if c is not None else "" for c in linhas[i_cab]]
    dados = [r for r in linhas[i_cab + 1:] if any(c not in (None, "") for c in r)]
    df = pd.DataFrame(dados, columns=cab)
    df = df.loc[:, [c for c in df.columns if c]]          # sem colunas sem nome
    return df.dropna(axis=1, how="all") if df.empty else df


# ---------------------------------------------------------------------------
# Tratamento (o que Renomear_Aba_* + Organizar_Colunas faziam)
# ---------------------------------------------------------------------------

class Apelidos:
    """Apelido e CPF faltante por (CPF + loja), com (nome + loja) de reserva --
    mesma regra do Organizar_Colunas.py."""

    def __init__(self, caminho: Path):
        self.por_doc: dict[str, tuple] = {}
        self.por_nome: dict[str, tuple] = {}
        if not caminho.exists():
            log.warning("Arquivo de apelidos não encontrado (%s): planilhas sem Apelido.", caminho)
            return
        df = pd.read_excel(caminho, engine="openpyxl")
        for _, r in df.iterrows():
            apelido = r.get("Apelido / Nome Fantasia")
            apelido = None if pd.isna(apelido) else apelido
            cpf = r.get("Documento")
            cpf = None if pd.isna(cpf) else cpf
            loja = self._n(r.get("Cadastrado Em"))
            for indice, chave in ((self.por_doc, self._n(cpf)), (self.por_nome, self._n(r.get("Nome / Razão Social")))):
                if not chave or not loja:
                    continue
                k = f"{chave}|||{loja}"
                if k not in indice:
                    indice[k] = (apelido, cpf)
                elif self._valido(cpf) and not self._valido(indice[k][1]):
                    indice[k] = (apelido or indice[k][0], cpf)

    @staticmethod
    def _n(t) -> str:
        return "" if t is None or (isinstance(t, float) and pd.isna(t)) or t == "" else str(t).strip().upper()

    @staticmethod
    def _valido(cpf) -> bool:
        return cpf not in (None, "") and not str(cpf).strip().startswith("000.000")

    def buscar(self, documento, nome, loja) -> tuple:
        loja = self._n(loja)
        for indice, chave in ((self.por_doc, self._n(documento)), (self.por_nome, self._n(nome))):
            if chave and loja and f"{chave}|||{loja}" in indice:
                return indice[f"{chave}|||{loja}"]
        return None, None

    def aplicar(self, df: pd.DataFrame) -> pd.DataFrame:
        if not self.por_doc and not self.por_nome:
            return df
        apelidos, docs = [], []
        for _, r in df.iterrows():
            ap, cpf = self.buscar(r.get("Documento"), r.get("Cliente"), r.get("Nome da Loja"))
            atual = r.get("Apelido")
            apelidos.append(atual if not _vazio(atual) else (ap or ""))
            doc = r.get("Documento")
            docs.append(doc if not _vazio(doc) else (cpf or ""))
        df["Apelido"] = apelidos
        df["Documento"] = docs
        return df


def _vazio(v) -> bool:
    return v is None or (isinstance(v, float) and pd.isna(v)) or str(v).strip() == ""


def _como_texto(v):
    if v is None or (isinstance(v, float) and pd.isna(v)) or v == "":
        return v
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def tratar(df: pd.DataFrame, loja: Loja, apelidos: Apelidos) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=COLUNAS_PADRAO)
    df = df.drop_duplicates()
    if loja.nome:
        df["Nome da Loja"] = loja.nome
    if "Número Titulo" in df.columns:
        df = df[~df["Número Titulo"].astype(str).str.strip().isin(TITULOS_FORA)]
    for col in COLUNAS_PADRAO:
        if col not in df.columns:
            df[col] = None
    df = apelidos.aplicar(df.copy())
    # Colunas de texto saem como texto mesmo quando o conteúdo é só dígitos
    # (Número "95", Bairro/Descrição numéricos), igual ao processo antigo.
    for col in COLUNAS_TEXTO:
        df[col] = df[col].map(_como_texto)
    extras = [c for c in df.columns if c not in COLUNAS_PADRAO]
    if extras:
        log.info("   colunas da SSÓtica fora do padrão (descartadas): %s", ", ".join(extras))
    return df[COLUNAS_PADRAO].reset_index(drop=True)


def _ano_lancamento(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, dayfirst=True, errors="coerce").dt.year


def salvar(df: pd.DataFrame, caminho: Path) -> None:
    tmp = caminho.with_name(f"~tmp_{caminho.name}")
    with pd.ExcelWriter(tmp, engine="openpyxl") as w:
        df.to_excel(w, sheet_name="BD", index=False)
    tmp.replace(caminho)


# ---------------------------------------------------------------------------
# App (BANCO_DADOS) — as regras ficam na função importar_parcelas_ssotica
# ---------------------------------------------------------------------------

LOTE_APP = 2000
ARQUIVO_IDS = "contas_receber_ids.json"   # lido pelo sumidas_ssotica.py
CAMPOS_APP = {   # coluna da planilha -> chave da função
    "Nome da Loja": "nome_da_loja", "Data Lançamento": "data_lancamento",
    "Data Vencimento": "data_vencimento", "Valor Original": "valor_original",
    "Valor Recebido": "valor_recebido", "Data de Recebimento": "data_de_recebimento",
    "Tipo de Cobrança": "tipo_de_cobranca", "Número Titulo": "numero_titulo", "Parcela": "parcela",
    "ID Parcela": "id_parcela", "Status": "status", "Cliente": "cliente", "Apelido": "apelido",
    "Documento": "documento", "Endereço": "endereco", "Número": "numero", "Bairro": "bairro",
    "Complemento": "complemento", "CEP": "cep", "Cidade": "cidade", "Estado": "estado",
    "Obs": "obs", "Código Externo": "codigo_externo", "Descrição": "descricao", "Venda Nº": "venda_n",
    "Convenio": "convenio", "telefone": "telefone", "celular": "celular", "celular1": "celular1",
    "celular2": "celular2", "email": "email",
}
_VALORES = {"valor_original", "valor_recebido"}
_DATAS = {"data_lancamento", "data_vencimento", "data_de_recebimento"}
_INTEIROS = {"numero_titulo", "parcela", "id_parcela", "venda_n"}


def _vazio(v) -> bool:
    return v is None or (isinstance(v, float) and pd.isna(v)) or (isinstance(v, str) and not v.strip())


def _valor(v):
    """'1.250,99' / 'R$ 10,00' / 10.5 -> 1250.99 / 10.0 / 10.5"""
    if _vazio(v):
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    t = re.sub(r"[^\d,.-]", "", str(v)).replace(".", "").replace(",", ".")
    try:
        return round(float(t), 2)
    except ValueError:
        return None


def _data(v):
    if _vazio(v):
        return None
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    try:
        return datetime.strptime(str(v).strip()[:10], "%d/%m/%Y").strftime("%Y-%m-%d")
    except ValueError:
        return None


def _inteiro(v):
    if _vazio(v):
        return None
    try:
        return int(float(str(v).strip()))
    except ValueError:
        return None


def linhas_para_app(df: pd.DataFrame) -> list[dict]:
    linhas = []
    for reg in df.to_dict("records"):
        l = {}
        for col, chave in CAMPOS_APP.items():
            v = reg.get(col)
            if chave in _VALORES:
                l[chave] = _valor(v)
            elif chave in _DATAS:
                l[chave] = _data(v)
            elif chave in _INTEIROS:
                l[chave] = _inteiro(v)
            elif chave == "cep":
                l[chave] = re.sub(r"\D", "", str(v)) or None if not _vazio(v) else None
            else:
                l[chave] = None if _vazio(v) else _como_texto(v).strip()
        if l["id_parcela"] is not None:
            linhas.append(l)
    return linhas


def aplicar_no_app(linhas: list[dict], url: str, chave: str) -> dict:
    """Envia em lotes para importar_parcelas_ssotica; soma os resultados."""
    h = {"apikey": chave, "Authorization": f"Bearer {chave}", "Content-Type": "application/json"}
    total = {"inseridas": 0, "atualizadas": 0, "quitadas": 0, "renegociadas": 0,
             "renegociadas_fora_do_app": 0, "clientes_novos": 0, "enderecos_novos": 0,
             "parcelas_acordo_ssotica": 0, "pagamentos_acordo": 0}
    ignoradas: list[dict] = []
    for i in range(0, len(linhas), LOTE_APP):
        lote = linhas[i:i + LOTE_APP]
        r = requests.post(f"{url}/rest/v1/rpc/importar_parcelas_ssotica",
                          headers=h, data=json.dumps({"p_linhas": lote}), timeout=300)
        if r.status_code >= 400:
            raise RuntimeError(f"importar_parcelas_ssotica falhou ({r.status_code}): {r.text[:500]}")
        res = r.json()
        for k in total:
            total[k] += res.get(k, 0)
        ignoradas += res.get("ignoradas", [])
    total["ignoradas"] = ignoradas
    return total


# ---------------------------------------------------------------------------

def baixar_loja(ss: SSOtica, loja: Loja, bruto: Path | None,
                situacoes: tuple[str, ...] = ("AP", "PG")) -> pd.DataFrame:
    fim = loja.fim or date.today()
    partes = []
    for a, b in semestres(loja.inicio, fim):
        conteudo = exportar(ss, loja.cod, a, b, situacoes)
        if conteudo is None:
            continue
        if bruto:
            (bruto / f"{loja.arquivo}_{'_'.join(situacoes)}_{a:%Y%m%d}_{b:%Y%m%d}.xlsx").write_bytes(conteudo)
        df = ler_planilha(conteudo)
        if not df.empty:
            lanc = pd.to_datetime(df.get("Data Lançamento"), dayfirst=True, errors="coerce")
            fora = ((lanc.dt.date < a) | (lanc.dt.date > b)).sum()
            if fora:
                log.warning("   %s %s..%s: %d linha(s) com lançamento fora do período pedido",
                            loja.cod, a, b, fora)
            partes.append(df.dropna(axis=1, how="all"))
    return pd.concat(partes, ignore_index=True) if partes else pd.DataFrame()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--loja", action="append", help="código da loja na SSÓtica (pode repetir); padrão: todas")
    ap.add_argument("--destino", type=Path, default=DESTINO_PADRAO, help="pasta das planilhas BD_Contasareceber_*.xlsx")
    ap.add_argument("--power-bi", action="store_true", help=f"gravar também em {DESTINO_POWER_BI}")
    ap.add_argument("--guardar-bruto", action="store_true", help="guarda as planilhas como vieram da SSÓtica")
    ap.add_argument("--app", action="store_true", help="aplica no Sistema de Cobrança (importar_parcelas_ssotica)")
    args = ap.parse_args()

    SAIDA.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout),
                  logging.FileHandler(SAIDA / "contas_receber_ssotica.log", encoding="utf-8")],
    )
    lojas = [l for l in LOJAS_CR if not args.loja or l.cod in args.loja]
    if not lojas:
        sys.exit("Nenhuma loja com esse código.")
    destinos = [args.destino] + ([DESTINO_POWER_BI] if args.power_bi else [])
    for d in destinos:
        d.mkdir(parents=True, exist_ok=True)
    bruto = None
    if args.guardar_bruto:
        bruto = SAIDA / "contas_receber_bruto"
        bruto.mkdir(parents=True, exist_ok=True)

    supa = config_supabase() if args.app else None
    apelidos = Apelidos(ARQUIVO_APELIDOS)
    ss = SSOtica(*credenciais_ssotica())
    ss.login()
    t_total = time.time()
    ignoradas_total: list[dict] = []
    # IDs que vieram no relatório, por loja do app: o sumidas_ssotica.py compara
    # com as parcelas em aberto no app (o que sumiu pode ter sido cancelado na
    # loja -- o relatório não tem a situação Cancelado).
    no_relatorio: dict[str, set[int]] = {}
    for loja in lojas:
        t0 = time.time()
        df = tratar(baixar_loja(ss, loja, bruto), loja, apelidos)
        if loja.arquivo.endswith("_Messejana") and not df.empty:
            lanc = pd.to_datetime(df["Data Lançamento"], dayfirst=True, errors="coerce").dt.date
            buraco = ((lanc >= date(2025, 10, 16)) & (lanc <= date(2025, 10, 28))).sum()
            if buraco:
                log.warning("   %d linha(s) da Messejana lançadas entre 16 e 28/10/2025 "
                            "(os scripts antigos não baixavam esse intervalo)", buraco)
        arquivos = []
        if loja.por_ano:
            anos = _ano_lancamento(df["Data Lançamento"])
            for ano in sorted(anos.dropna().unique()):
                arquivos.append((f"{loja.arquivo}_{int(ano)}.xlsx", df[anos == ano]))
        else:
            arquivos.append((f"{loja.arquivo}.xlsx", df))
        for nome, parte in arquivos:
            for d in destinos:
                salvar(parte, d / nome)
        status = df["Status"].value_counts().to_dict() if not df.empty else {}
        log.info("%s %-38s %6d linhas %s (%.0fs)", loja.cod, loja.arquivo, len(df), status, time.time() - t0)
        if supa and loja.app and not df.empty:
            # Renegociadas (situação RE): só para o app tirar da cobrança a
            # parcela antiga; não entram nas planilhas do Power BI.
            reneg = tratar(baixar_loja(ss, loja, bruto, situacoes=("RE",)), loja, apelidos)
            reneg = reneg[reneg["Status"].astype(str).str.strip() == "Renegociado"]
            linhas = linhas_para_app(df) + linhas_para_app(reneg)
            for l in linhas:
                if l["nome_da_loja"]:
                    no_relatorio.setdefault(l["nome_da_loja"], set()).add(l["id_parcela"])
            res = aplicar_no_app(linhas, *supa)
            ign = res.pop("ignoradas")
            por_motivo: dict[str, int] = {}
            for x in ign:
                por_motivo[x["motivo"]] = por_motivo.get(x["motivo"], 0) + 1
            log.info("   app: %s; não mexeu: %s", res, por_motivo or "nada")
            ignoradas_total += [{**x, "loja": loja.arquivo} for x in ign]
    if ignoradas_total:
        arq = SAIDA / f"contas_receber_nao_aplicadas_{datetime.now():%Y%m%d_%H%M}.csv"
        pd.DataFrame(ignoradas_total).to_csv(arq, index=False, sep=";", encoding="utf-8-sig")
        log.info("Parcelas que o app não atualizou (cancelada/acordo/pago no app): %s", arq)
    if supa and no_relatorio and not args.loja:
        # Só com todas as lojas: rodada parcial faria as outras parecerem sumidas.
        arq = SAIDA / ARQUIVO_IDS
        arq.write_text(json.dumps({"gerado_em": datetime.now().isoformat(timespec="seconds"),
                                   "lojas": {k: sorted(v) for k, v in no_relatorio.items()}}),
                       encoding="utf-8")
        log.info("IDs do relatório gravados em %s (%d lojas)", arq, len(no_relatorio))
    log.info("Concluído em %.0fs. Planilhas em: %s", time.time() - t_total, " | ".join(map(str, destinos)))


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except BaseException:
        log.exception("Falhou")
        sys.exit(1)
