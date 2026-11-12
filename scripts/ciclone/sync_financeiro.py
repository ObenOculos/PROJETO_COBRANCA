#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Sincroniza o financeiro (contas a receber) do ERP Ciclone para a Loja
"FOCCO BRASIL" no Sistema de Cobranca (tabela BANCO_DADOS, Supabase do
projeto Cobradores).

Fonte: fn_crtitulo (uma linha por parcela de titulo), empresas 1 e 2 do
Ciclone (mesma filial "FOCCO BRASIL" nas duas). Cliente: pg_view_relacionaclnforfun.

IMPORTANTE sobre fncrt_situacao: nao e um status de pagamento confiavel.
Verificado em produção (2026-11-01): titulos com saldo=0 majoritariamente
continuam com situacao='A'. Por isso o status de pagamento vem do SALDO
(fncrt_valor - fncrt_saldo), nao da situacao. A situacao decide so dois
casos: 'C' (cancelado) e 'F' (2026-11-06: titulo de ORIGEM de uma fatura =
agrupamento do Ciclone -- fn_crfatura/fn_crfaturatitulo/
fn_crfaturatitulogerado; por isso nao tem baixa) -> status "agrupado".

Recebido = so dinheiro (2026-11-06): o principal encerrado (valor - saldo) e
dividido pela forma de pagamento das baixas ATIVAS do titulo. Forma
RENEGOCIACAO (acordo do financeiro, gera titulos novos) e DESCONTO nao sao
recebimento -- vao para `desconto`; titulo encerrado so por renegociacao vira
status "renegociado". Ver FORMA_RENEGOCIACAO/FORMA_DESCONTO abaixo.

Idempotencia: id_parcela nao existe no Ciclone e BANCO_DADOS.id_parcela e
bigint sem identity, entao cada fncrt_uuid precisa de um id_parcela estavel
entre rodadas. Isso mora na tabela auxiliar `ciclone_titulo_map`
(migration 20261101000001) -- 1a vez que o sync ve o titulo, grava e ganha
um id; da em diante reusa sempre o mesmo id_parcela (upsert, nunca insert
duplicado).

Uso:
    python sync_financeiro.py --dry-run             # so mostra o resumo, nao grava nada
    python sync_financeiro.py --dry-run --limit 50
    python sync_financeiro.py --limit 50             # grava so 50 titulos (teste real)
    python sync_financeiro.py                        # sincronizacao completa
"""
import argparse
import json
import logging
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Optional

import psycopg2
import psycopg2.extras
from dotenv import dotenv_values

AQUI = Path(__file__).resolve().parent
REPO = AQUI.parent.parent

# Tudo no .env do repositório (fora do git): ERP_* (Ciclone) e
# VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY. Até 2026-11-12 o script morava
# em Projetos_Dev/Ciclone/Esquema_SQL/sync_cobranca e lia o ERP_* do .env do
# app consulta_pedidos.
CICLONE_ENV_PATH = REPO / ".env"
COBRANCA_ENV_PATH = REPO / ".env"

NOME_DA_LOJA = "Focco Brasil"
EMPRESAS = (1, 2)
LOTE = 500
# Lotes de leitura por filtro "in.(...)" na URL (GET) precisam ser menores que
# os de escrita (corpo do POST): 500 UUIDs/documentos no querystring passam
# de 18 mil caracteres, perto do limite de URL de alguns proxies/CDNs.
LOTE_CONSULTA = 100

LOGS_DIR = AQUI / "saida"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger("sync_financeiro")


def configurar_log() -> None:
    logger.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s", "%Y-%m-%d %H:%M:%S")

    arquivo = logging.FileHandler(
        LOGS_DIR / f"sync_{date.today().isoformat()}.log", encoding="utf-8"
    )
    arquivo.setFormatter(fmt)
    logger.addHandler(arquivo)

    console = logging.StreamHandler()
    console.setFormatter(fmt)
    logger.addHandler(console)


# ---------------------------------------------------------------------------
# Conexoes
# ---------------------------------------------------------------------------

def conectar_ciclone():
    env = dotenv_values(CICLONE_ENV_PATH)
    if not env.get("ERP_HOST") or not env.get("ERP_USER") or not env.get("ERP_PASSWORD"):
        sys.exit(f"ERRO: ERP_HOST/ERP_USER/ERP_PASSWORD nao encontrados em {CICLONE_ENV_PATH}")
    return psycopg2.connect(
        host=env["ERP_HOST"],
        port=int(env.get("ERP_PORT", 5432)),
        dbname=env.get("ERP_DATABASE", "ciclone"),
        user=env["ERP_USER"],
        password=env["ERP_PASSWORD"],
        client_encoding=env.get("ERP_ENCODING", "WIN1252"),
        connect_timeout=int(env.get("ERP_TIMEOUT", 15)),
    )


class SupabaseRestClient:
    def __init__(self, url: str, key: str):
        self.base_url = url.rstrip("/") + "/rest/v1"
        self.key = key

    def request(self, method: str, table: str, params: dict | None = None,
                body: list[dict] | None = None, upsert: bool = False,
                return_representation: bool = False) -> list[dict]:
        query = urlencode(params or {}, doseq=True)
        url = f"{self.base_url}/{quote(table, safe='')}"
        if query:
            url += f"?{query}"
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        if upsert:
            retorno = "representation" if return_representation else "minimal"
            headers["Prefer"] = f"resolution=merge-duplicates,return={retorno}"
        request = Request(
            url,
            data=json.dumps(body).encode("utf-8") if body is not None else None,
            headers=headers,
            method=method,
        )
        try:
            with urlopen(request, timeout=60) as response:
                payload = response.read()
        except (HTTPError, URLError) as exc:
            detalhe = exc.read().decode("utf-8", errors="replace") if isinstance(exc, HTTPError) else str(exc)
            raise RuntimeError(f"Falha na API do Supabase ({table}): {detalhe}") from exc
        if not payload:
            return []
        return json.loads(payload)


def conectar_cobranca() -> SupabaseRestClient:
    env = dotenv_values(COBRANCA_ENV_PATH)
    url = env.get("VITE_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit(
            f"ERRO: VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nao encontrados em {COBRANCA_ENV_PATH}"
        )
    return SupabaseRestClient(url, key)


# ---------------------------------------------------------------------------
# Extracao do Ciclone
# ---------------------------------------------------------------------------

# Formas de pagamento de baixa (fn_formapagamento) que NAO sao dinheiro
# entrando. Verificado em 2026-11-06:
#   100 = RENEGOCIACAO (tipo 'N'): a baixa encerra o titulo e gera titulos
#         novos ("RENEGOCIACAO A RECEBER", numero = fnbfp_numeronovodocumento)
#         -- o acordo feito pelo financeiro. Vira status "renegociado".
#    14 = DESCONTO: abatimento concedido, vai para a coluna `desconto`.
# Devolucao (9), taxa de antecipacao (13) e outras formas nao monetarias
# seguem contando como recebido por enquanto -- pendencia em docs/PROGRESSO.md.
FORMA_RENEGOCIACAO = 100
FORMA_DESCONTO = 14

QUERY_TITULOS = """
WITH formas_por_baixa AS (
    -- Quanto de cada baixa ATIVA foi pago por cada tipo de forma. A soma das
    -- formas = principal + encargos dos titulos baixados (conferido em
    -- 2026-11-06 nas 7.666 baixas ativas), entao a proporcao por forma vale
    -- para o principal de cada titulo da baixa.
    SELECT
        bfp.pgemp_codigo,
        bfp.pgfll_codigo,
        bfp.fncrb_numerobaixa,
        SUM(bfp.fnbfp_valor) AS total,
        COALESCE(SUM(bfp.fnbfp_valor) FILTER (WHERE bfp.fnfpt_codigo = %(forma_renegociacao)s), 0) AS renegociacao,
        COALESCE(SUM(bfp.fnbfp_valor) FILTER (WHERE bfp.fnfpt_codigo = %(forma_desconto)s), 0) AS desconto
    FROM fn_crbaixaformapagamento bfp
    JOIN fn_crbaixa b
      ON b.pgemp_codigo = bfp.pgemp_codigo
     AND b.pgfll_codigo = bfp.pgfll_codigo
     AND b.fncrb_numerobaixa = bfp.fncrb_numerobaixa
    WHERE b.fncrb_situacao = 'B'  -- 'C' = baixa cancelada, nao conta
    GROUP BY 1, 2, 3
)
SELECT
    t.fncrt_uuid,
    t.pgcln_codigo,
    t.fncrt_numerotitulo,
    t.fncrt_parcela,
    t.fncrt_dataemissao,
    t.fncrt_datamovimento,
    t.fncrt_datavencimento,
    t.fncrt_valor,
    t.fncrt_saldo,
    t.fncrt_situacao,
    t.fncrt_percentualmulta,
    t.fncrt_percentualjurodia,
    v.pgview_cpfcnpj,
    v.pgview_nome,
    v.pgview_nomefantasia,
    v.pgview_endereco,
    v.pgview_numero,
    v.pgview_bairro,
    v.pgview_complemento,
    v.pgview_cep,
    v.pgview_estado,
    c.pgcdd_nome AS cidade,
    v.pgview_fonefixo,
    v.pgview_telefonecelular,
    v.pgview_email,
    -- Cadastro espelhado em clientes (migration 20261106000011 do app).
    v.pgview_nomecontato,
    v.pgview_telefonecontato,
    v.pgview_telefonecontato2,
    v.pgview_observacao,
    vend.pgfun_nome AS vendedor_nome,
    reg.pgreg_descricao AS regiao_nome,
    bx.data_baixa,
    bx.principal_renegociado,
    bx.principal_desconto
FROM fn_crtitulo t
LEFT JOIN pg_view_relacionaclnforfun v ON v.pgview_codigo = t.pgcln_codigo
LEFT JOIN pg_cidade c ON c.pgcdd_codigo = v.pgview_cidade
LEFT JOIN pg_funcionario vend ON vend.pgfun_codigo = v.pgview_vendedorresponsavel
LEFT JOIN pg_regiao reg ON reg.pgreg_codigo = v.pgview_regiao
LEFT JOIN LATERAL (
    -- Baixas ATIVAS do titulo: data da ultima e quanto do principal foi
    -- encerrado por renegociacao / desconto (proporcao da forma na baixa).
    SELECT
        MAX(b.fncrb_databaixa) AS data_baixa,
        COALESCE(SUM(tb.fntbd_valorbaixa * fp.renegociacao / NULLIF(fp.total, 0)), 0) AS principal_renegociado,
        COALESCE(SUM(tb.fntbd_valorbaixa * fp.desconto / NULLIF(fp.total, 0)), 0) AS principal_desconto
    FROM fn_crtitulobaixado tb
    JOIN fn_crbaixa b
      ON b.pgemp_codigo = tb.pgemp_codigo
     AND b.pgfll_codigo = tb.pgfll_codigo
     AND b.fncrb_numerobaixa = tb.fncrb_numerobaixa
     AND b.fncrb_situacao = 'B'
    LEFT JOIN formas_por_baixa fp
      ON fp.pgemp_codigo = b.pgemp_codigo
     AND fp.pgfll_codigo = b.pgfll_codigo
     AND fp.fncrb_numerobaixa = b.fncrb_numerobaixa
    WHERE tb.pgemp_codigo = t.pgemp_codigo
      AND tb.pgfll_codigo = t.pgfll_codigo
      AND tb.pgcln_codigo = t.pgcln_codigo
      AND tb.fncrt_sequenciatitulo = t.fncrt_sequenciatitulo
) bx ON TRUE
WHERE t.pgemp_codigo = ANY(%(empresas)s)
  -- pgcln_codigo < 100000 nao e cliente de verdade: sao 35 contas internas
  -- confirmadas (a propria FOCCO BRASIL, um socio, ~27 pessoas fisicas com
  -- lancamentos minusculos tipo adiantamento/reembolso, e processadoras de
  -- pagamento como BLU/CIELO/MERCADO PAGO). Todo cliente revendedor real
  -- (as oticas que compram da FOCCO a prazo) comeca em 100000+.
  AND t.pgcln_codigo >= 100000
ORDER BY t.pgemp_codigo, t.pgcln_codigo, t.fncrt_sequenciatitulo
"""


# Renegociacoes (baixa com forma RENEGOCIACAO): cabecalho + titulos de origem
# (baixados) + gerados (parcelas novas). Conferido em 2026-11-06 nas 319
# baixas: 1 novo documento e 1 cliente por baixa; gerados = (empresa,
# cliente, numero do novo documento), soma = valor da forma 100 em todas.
QUERY_RENEGOCIACOES = """
SELECT
    b.fncrb_uuid AS baixa_uuid,
    b.fncrb_databaixa AS data_baixa,
    b.fncrb_situacao AS situacao,
    MAX(bfp.fnbfp_numeronovodocumento) FILTER (WHERE bfp.fnfpt_codigo = %(forma_renegociacao)s) AS novo_documento,
    COALESCE(SUM(bfp.fnbfp_valor) FILTER (WHERE bfp.fnfpt_codigo = %(forma_renegociacao)s), 0) AS valor_renegociado,
    SUM(bfp.fnbfp_valor) AS valor_total_baixa,
    b.pgemp_codigo,
    b.pgfll_codigo,
    b.fncrb_numerobaixa
FROM fn_crbaixa b
JOIN fn_crbaixaformapagamento bfp
  ON bfp.pgemp_codigo = b.pgemp_codigo
 AND bfp.pgfll_codigo = b.pgfll_codigo
 AND bfp.fncrb_numerobaixa = b.fncrb_numerobaixa
WHERE b.pgemp_codigo = ANY(%(empresas)s)
GROUP BY b.fncrb_uuid, b.fncrb_databaixa, b.fncrb_situacao, b.pgemp_codigo, b.pgfll_codigo, b.fncrb_numerobaixa
HAVING bool_or(bfp.fnfpt_codigo = %(forma_renegociacao)s)
"""

QUERY_RENEGOCIACAO_ORIGENS = """
SELECT
    b.fncrb_uuid AS baixa_uuid,
    t.fncrt_uuid,
    t.pgcln_codigo,
    tb.fntbd_valorbaixa AS principal,
    tb.fntbd_valorjuro AS juros,
    tb.fntbd_valormulta AS multa,
    tb.fntbd_valordesconto AS desconto
FROM fn_crbaixa b
JOIN fn_crtitulobaixado tb
  ON tb.pgemp_codigo = b.pgemp_codigo
 AND tb.pgfll_codigo = b.pgfll_codigo
 AND tb.fncrb_numerobaixa = b.fncrb_numerobaixa
JOIN fn_crtitulo t
  ON t.pgemp_codigo = tb.pgemp_codigo
 AND t.pgfll_codigo = tb.pgfll_codigo
 AND t.pgcln_codigo = tb.pgcln_codigo
 AND t.fncrt_sequenciatitulo = tb.fncrt_sequenciatitulo
WHERE b.fncrb_uuid = ANY(%(baixas)s::uuid[])
"""

QUERY_RENEGOCIACAO_GERADOS = """
SELECT
    r.baixa_uuid,
    t.fncrt_uuid,
    t.fncrt_parcela AS parcela,
    t.fncrt_datavencimento AS data_vencimento,
    t.fncrt_valor AS valor
FROM unnest(%(baixas)s::uuid[], %(empresas_baixa)s::int[], %(clientes)s::int[], %(documentos)s::text[])
     AS r(baixa_uuid, pgemp_codigo, pgcln_codigo, novo_documento)
JOIN fn_crtitulo t
  ON t.pgemp_codigo = r.pgemp_codigo
 AND t.pgcln_codigo = r.pgcln_codigo
 AND t.fncrt_numerotitulo = r.novo_documento
"""


def extrair_renegociacoes(conn) -> list[dict]:
    """Devolve as renegociacoes do Ciclone com origens e gerados (uuids do
    Ciclone; a traducao para id_parcela fica para quem grava)."""
    params = {"empresas": list(EMPRESAS), "forma_renegociacao": FORMA_RENEGOCIACAO}
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(QUERY_RENEGOCIACOES, params)
        cabecalhos = {str(r["baixa_uuid"]): dict(r, origens=[], gerados=[]) for r in cur.fetchall()}
        if not cabecalhos:
            return []
        baixas = list(cabecalhos.keys())

        cur.execute(QUERY_RENEGOCIACAO_ORIGENS, {"baixas": baixas})
        for r in cur.fetchall():
            cabecalhos[str(r["baixa_uuid"])]["origens"].append(r)

        # Cliente da renegociacao = cliente das origens (1 por baixa, conferido).
        com_cliente = [c for c in cabecalhos.values() if c["origens"] and c["novo_documento"]]
        cur.execute(QUERY_RENEGOCIACAO_GERADOS, {
            "baixas": [str(c["baixa_uuid"]) for c in com_cliente],
            "empresas_baixa": [c["pgemp_codigo"] for c in com_cliente],
            "clientes": [c["origens"][0]["pgcln_codigo"] for c in com_cliente],
            "documentos": [str(c["novo_documento"]).strip() for c in com_cliente],
        })
        for r in cur.fetchall():
            cabecalhos[str(r["baixa_uuid"])]["gerados"].append(r)
    return list(cabecalhos.values())


def extrair_titulos(conn, limit: Optional[int] = None):
    sql = QUERY_TITULOS
    if limit:
        sql += f"\nLIMIT {int(limit)}"
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, {
            "empresas": list(EMPRESAS),
            "forma_renegociacao": FORMA_RENEGOCIACAO,
            "forma_desconto": FORMA_DESCONTO,
        })
        return cur.fetchall()


# ---------------------------------------------------------------------------
# Transformacao
# ---------------------------------------------------------------------------

def formatar_documento(bruto: Optional[str]) -> Optional[str]:
    digitos = re.sub(r"\D", "", bruto or "")
    if len(digitos) == 11 and digitos != "0" * 11:
        return f"{digitos[0:3]}.{digitos[3:6]}.{digitos[6:9]}-{digitos[9:11]}"
    if len(digitos) == 14 and digitos != "0" * 14:
        return f"{digitos[0:2]}.{digitos[2:5]}.{digitos[5:8]}/{digitos[8:12]}-{digitos[12:14]}"
    return None


def como_decimal(valor) -> Decimal:
    try:
        return Decimal(valor) if valor is not None else Decimal("0")
    except (InvalidOperation, TypeError):
        return Decimal("0")


def texto_limpo(valor) -> Optional[str]:
    """Texto do cadastro do ERP sem espacos nas pontas; vazio e o literal
    'null' (aparece gravado assim em pgview_observacao) viram None."""
    texto = str(valor).strip() if valor is not None else ""
    return None if not texto or texto.lower() == "null" else texto


def numero_titulo_numerico(valor) -> Optional[int]:
    """Converte somente títulos representáveis pela coluna bigint do app."""
    texto = str(valor or "").strip()
    if texto.isdigit():
        return int(texto)
    grupos = re.findall(r"\d+", texto)
    return int(grupos[0]) if len(grupos) == 1 else None


@dataclass
class LinhaTransformada:
    banco_dados: dict
    cliente: dict


def transformar(row: dict, hoje: date) -> Optional[LinhaTransformada]:
    documento = formatar_documento(row["pgview_cpfcnpj"])
    if not documento:
        return None  # cliente generico/sem CPF-CNPJ valido -- nao e identidade confiavel

    valor = como_decimal(row["fncrt_valor"])
    saldo = como_decimal(row["fncrt_saldo"])
    situacao_erp = (row["fncrt_situacao"] or "").strip()
    vencimento = row["fncrt_datavencimento"]

    cancelado = situacao_erp == "C"
    # 'F' = titulo de ORIGEM de uma fatura (agrupamento) do Ciclone: os titulos
    # da nota fiscal sao substituidos por titulos novos (gerados, implantacao
    # 'M'). Verificado em 2026-11-06: os 8.650 titulos 'F' estao todos em
    # fn_crfaturatitulo de fatura ativa, com saldo 0 e sem baixa. Nao e
    # pagamento (o dinheiro entra nos gerados) nem divida (ela mora nos
    # gerados) -- antes caia como "recebido" pelo saldo 0 e duplicava o
    # recebido. Saldo zera via desconto = valor, mesma convencao do cancelado.
    # 'F' com saldo > 0 nao deveria existir; se aparecer, segue como titulo em
    # aberto (nunca some divida em silencio) e e contado no log.
    agrupado = situacao_erp == "F" and saldo <= 0
    pago = (not cancelado) and (not agrupado) and saldo <= 0

    # Principal ja encerrado no ERP (valor - saldo), separado pela forma da
    # baixa: renegociacao e desconto NAO sao dinheiro entrando. So o resto e
    # recebido. Limitado ao encerrado para nunca passar do valor do titulo.
    centavo = Decimal("0.01")
    encerrado = max(valor - saldo, Decimal("0"))
    renegociado_parte = min(encerrado, como_decimal(row["principal_renegociado"])).quantize(centavo)
    desconto_parte = min(encerrado - renegociado_parte, como_decimal(row["principal_desconto"])).quantize(centavo)
    dinheiro_parte = encerrado - renegociado_parte - desconto_parte
    # Renegociado = titulo encerrado por renegociacao SEM dinheiro na baixa.
    # Se teve dinheiro, segue como recebido pela parte em dinheiro -- nunca
    # esconde pagamento real (isForaDaCobranca tira o titulo dos totais).
    renegociado = pago and renegociado_parte > 0 and dinheiro_parte <= centavo

    if cancelado:
        status = "cancelado"
        valor_recebido = Decimal("0")
        desconto = valor
        data_recebimento = None
        dias_atraso = 0
    elif agrupado:
        status = "agrupado"
        valor_recebido = Decimal("0")
        desconto = valor
        data_recebimento = None
        dias_atraso = 0
    elif renegociado:
        status = "renegociado"
        valor_recebido = Decimal("0")
        desconto = valor  # parte renegociada (+ desconto da baixa), saldo zera
        data_recebimento = None
        dias_atraso = 0
    elif pago:
        status = "recebido"
        valor_recebido = dinheiro_parte
        desconto = valor - dinheiro_parte  # desconto/renegociado da baixa; saldo zera
        data_recebimento = row["data_baixa"] or row["fncrt_datamovimento"] or row["fncrt_dataemissao"]
        dias_atraso = 0
    else:
        valor_recebido = dinheiro_parte
        desconto = renegociado_parte + desconto_parte
        data_recebimento = None
        dias_atraso = max((hoje - vencimento).days, 0) if vencimento else 0
        status = "em_atraso" if dias_atraso > 0 else "pendente"

    nome = (row["pgview_nomefantasia"] or row["pgview_nome"] or "").strip()
    titulo_origem = str(row["fncrt_numerotitulo"] or "").strip()
    numero_titulo = numero_titulo_numerico(row["fncrt_numerotitulo"])

    banco_dados = {
        "nome_da_loja": NOME_DA_LOJA,
        "codigo_externo": str(row["fncrt_uuid"]),
        "numero_titulo": numero_titulo,
        "parcela": row["fncrt_parcela"],
        # Chave sempre presente (mesmo None) -- PostgREST exige chaves
        # uniformes em todo o lote de um POST em array (erro PGRST102).
        "descricao": f"Ciclone: {titulo_origem}" if titulo_origem and numero_titulo is None else None,
        "data_lancamento": row["fncrt_dataemissao"].isoformat() if row["fncrt_dataemissao"] else None,
        "data_vencimento": vencimento.isoformat() if vencimento else None,
        "valor_original": float(valor),
        "multa": float(row["fncrt_percentualmulta"] or 0),
        "juros_por_dia": float(row["fncrt_percentualjurodia"] or 0),
        "valor_recebido": float(valor_recebido),
        "data_de_recebimento": data_recebimento.isoformat() if data_recebimento else None,
        "dias_em_atraso": dias_atraso,
        "desconto": float(desconto),
        "status": status,
        "cliente": nome,
        "documento": documento,
        "endereco": row["pgview_endereco"],
        "numero": row["pgview_numero"],
        "bairro": row["pgview_bairro"],
        "complemento": row["pgview_complemento"],
        "cep": row["pgview_cep"],
        "cidade": row["cidade"],
        "estado": row["pgview_estado"],
    }

    cliente = {
        "documento": documento,
        "nome": nome,
        "telefone": row["pgview_fonefixo"] or None,
        "celular": row["pgview_telefonecelular"] or None,
        "email": row["pgview_email"] or None,
        # Espelho do ERP (CAMPOS_ERP): sobrescritos a cada rodada.
        "razao_social": texto_limpo(row["pgview_nome"]),
        "contato_nome": texto_limpo(row["pgview_nomecontato"]),
        "contato_telefone": texto_limpo(row["pgview_telefonecontato"]),
        "contato_telefone2": texto_limpo(row["pgview_telefonecontato2"]),
        "vendedor_responsavel": texto_limpo(row["vendedor_nome"]),
        "regiao": texto_limpo(row["regiao_nome"]),
        "observacao_erp": texto_limpo(row["pgview_observacao"]),
        # Codigo do cliente no Ciclone (migration 20261109000001 do app). Um
        # CPF/CNPJ pode ter mais de um codigo -- juntados em
        # juntar_codigos_cliente na hora de agrupar por documento.
        "codigo_cliente_erp": str(row["pgcln_codigo"]) if row["pgcln_codigo"] is not None else None,
    }

    return LinhaTransformada(banco_dados=banco_dados, cliente=cliente)


# ---------------------------------------------------------------------------
# Resolucao de id_parcela (ciclone_titulo_map)
# ---------------------------------------------------------------------------

def resolver_ids_parcela(sb: SupabaseRestClient, uuids: list[str]) -> dict:
    """Garante uma linha em ciclone_titulo_map para cada fncrt_uuid e devolve
    {fncrt_uuid: id_parcela}. Upsert com Prefer: return=representation -- o
    proprio POST ja devolve o id_parcela (novo ou existente), sem precisar de
    um GET separado depois (antes eram ~500+300 requisicoes; agora so ~70)."""
    mapa: dict = {}
    for i in range(0, len(uuids), LOTE):
        lote = uuids[i : i + LOTE]
        resp = sb.request(
            "POST",
            "ciclone_titulo_map",
            params={"on_conflict": "fncrt_uuid"},
            body=[{"fncrt_uuid": u} for u in lote],
            upsert=True,
            return_representation=True,
        )
        for linha in resp:
            mapa[linha["fncrt_uuid"]] = linha["id_parcela"]
    return mapa


# ---------------------------------------------------------------------------
# Upsert em clientes. Duas regras, por dono do dado:
#   CAMPOS_EDITAVEIS: so preenche o que estiver vazio -- nunca sobrescreve
#     cadastro ja editado na mao pelo cobrador/gestor.
#   CAMPOS_ERP: espelho do Ciclone (migration 20261106000011 do app). Sempre
#     iguala ao ERP, inclusive apagando; corrigir esses campos e no Ciclone.
# Cliente sem nenhuma diferenca nao e regravado (erp_atualizado_em so anda
# quando algum CAMPO_ERP mudou de verdade).
# ---------------------------------------------------------------------------

CAMPOS_EDITAVEIS = ("nome", "telefone", "celular", "email")
CAMPOS_ERP = (
    "razao_social",
    "contato_nome",
    "contato_telefone",
    "contato_telefone2",
    "vendedor_responsavel",
    "regiao",
    "observacao_erp",
    "codigo_cliente_erp",
)

# Colunas de CAMPOS_ERP que vieram em migration posterior a 20261106000011:
# se ainda nao existirem no app, saem do upsert sem derrubar o resto.
CAMPOS_ERP_OPCIONAIS = {"codigo_cliente_erp": "20261109000001"}


def juntar_codigos_cliente(codigos: set) -> Optional[str]:
    """Codigos do Ciclone de um mesmo CPF/CNPJ, em ordem numerica, separados
    por virgula ("100123, 100456"). 1 de 1.890 documentos tem dois (medido em
    2026-11-09); o app guarda um registro por documento."""
    validos = sorted((c for c in codigos if c), key=lambda c: (len(c), c))
    return ", ".join(validos) or None


def coluna_existe(sb: SupabaseRestClient, coluna: str) -> bool:
    try:
        sb.request("GET", "clientes", params={"select": coluna, "limit": "1"})
        return True
    except RuntimeError:
        return False


def colunas_erp_existem(sb: SupabaseRestClient) -> bool:
    """A migration do app pode ainda nao ter sido aplicada quando o script
    novo rodar (tarefa das 5h). Nesse caso o sync segue so com os campos
    antigos -- os titulos nao podem parar por causa do cadastro."""
    try:
        sb.request("GET", "clientes", params={"select": "erp_atualizado_em", "limit": "1"})
        return True
    except RuntimeError as exc:
        logger.warning(
            "clientes sem as colunas do ERP (migration 20261106000011 nao aplicada?) -- "
            "gravando so nome/telefones/email. Detalhe: %s", exc,
        )
        return False


def upsert_clientes(sb: SupabaseRestClient, clientes_por_documento: dict) -> None:
    campos_erp = CAMPOS_ERP if colunas_erp_existem(sb) else ()
    for coluna, migration in CAMPOS_ERP_OPCIONAIS.items():
        if coluna in campos_erp and not coluna_existe(sb, coluna):
            logger.warning(
                "clientes sem a coluna %s (migration %s nao aplicada?) -- seguindo sem ela.",
                coluna, migration,
            )
            campos_erp = tuple(c for c in campos_erp if c != coluna)
    fora = set(CAMPOS_ERP) - set(campos_erp)
    if fora:
        clientes_por_documento = {
            doc: {k: v for k, v in dados.items() if k not in fora}
            for doc, dados in clientes_por_documento.items()
        }
    documentos = list(clientes_por_documento.keys())
    existentes: dict = {}
    extras = (*campos_erp, "erp_atualizado_em") if campos_erp else ()
    colunas = ",".join(("documento", *CAMPOS_EDITAVEIS, *extras))
    for i in range(0, len(documentos), LOTE_CONSULTA):
        lote = documentos[i : i + LOTE_CONSULTA]
        resp = sb.request(
            "GET",
            "clientes",
            params={
                "select": colunas,
                "documento": f"in.({','.join(lote)})",
            },
        )
        for linha in resp:
            existentes[linha["documento"]] = linha

    agora = datetime.now(timezone.utc).isoformat()
    novos = []
    atualizacoes = []
    erp_alterados = 0
    for doc, dados in clientes_por_documento.items():
        atual = existentes.get(doc)
        if atual is None:
            novos.append({**dados, "erp_atualizado_em": agora} if campos_erp else dados)
            continue
        # PostgREST exige chaves uniformes em todo o lote (PGRST102), entao
        # o patch sempre leva todas as colunas -- nos campos editaveis ja
        # preenchidos, reenviamos o valor atual (sem efeito), nunca o do Ciclone.
        houve_mudanca = False
        patch = {"documento": doc}
        for campo in CAMPOS_EDITAVEIS:
            atual_valor = atual.get(campo)
            if not (atual_valor or "").strip() and dados.get(campo):
                patch[campo] = dados[campo]
                houve_mudanca = True
            else:
                patch[campo] = atual_valor
        mudou_erp = False
        for campo in campos_erp:
            patch[campo] = dados.get(campo)
            if patch[campo] != atual.get(campo):
                mudou_erp = True
        if campos_erp:
            patch["erp_atualizado_em"] = agora if mudou_erp else atual.get("erp_atualizado_em")
        if mudou_erp:
            erp_alterados += 1
        if houve_mudanca or mudou_erp:
            atualizacoes.append(patch)
    logger.info("clientes: %d com dados do ERP alterados", erp_alterados)

    for grupo, nome in ((novos, "novos"), (atualizacoes, "atualizacoes")):
        for i in range(0, len(grupo), LOTE):
            lote = grupo[i : i + LOTE]
            if lote:
                sb.request(
                    "POST",
                    "clientes",
                    params={"on_conflict": "documento"},
                    body=lote,
                    upsert=True,
                )
        logger.info("clientes: %d %s", len(grupo), nome)


# ---------------------------------------------------------------------------
# Upsert em BANCO_DADOS
# ---------------------------------------------------------------------------

def upsert_banco_dados(sb: SupabaseRestClient, linhas: list[dict]) -> None:
    for i in range(0, len(linhas), LOTE):
        lote = linhas[i : i + LOTE]
        sb.request(
            "POST",
            "BANCO_DADOS",
            params={"on_conflict": "id_parcela"},
            body=lote,
            upsert=True,
        )
        logger.info("BANCO_DADOS: %d/%d gravados", min(i + LOTE, len(linhas)), len(linhas))


# ---------------------------------------------------------------------------
# Renegociacoes (ciclone_renegociacoes / ciclone_renegociacao_titulos)
# ---------------------------------------------------------------------------

def _dinheiro(valor) -> Optional[float]:
    return None if valor is None else float(como_decimal(valor).quantize(Decimal("0.01")))


def montar_renegociacoes(renegociacoes: list[dict], mapa_ids: dict, documento_por_uuid: dict):
    """Traduz para o app: uuid do Ciclone -> id_parcela, cliente -> documento.
    Renegociacao sem nenhuma origem conhecida pelo app (conta interna, cliente
    sem CPF/CNPJ, --limit) e pulada inteira -- os itens tem FK para BANCO_DADOS."""
    cabecalhos, itens, puladas = [], [], 0
    for r in renegociacoes:
        origens = [o for o in r["origens"] if str(o["fncrt_uuid"]) in mapa_ids]
        documento = next(
            (documento_por_uuid[str(o["fncrt_uuid"])] for o in origens if str(o["fncrt_uuid"]) in documento_por_uuid),
            None,
        )
        if not origens or not documento or not r["novo_documento"] or not r["data_baixa"]:
            puladas += 1
            continue
        baixa = str(r["baixa_uuid"])
        cabecalhos.append({
            "baixa_uuid": baixa,
            "novo_documento": str(r["novo_documento"]).strip(),
            "documento": documento,
            "data_baixa": r["data_baixa"].isoformat(),
            "situacao": "ativa" if (r["situacao"] or "").strip() == "B" else "cancelada",
            "valor_renegociado": _dinheiro(r["valor_renegociado"]),
            "valor_total_baixa": _dinheiro(r["valor_total_baixa"]),
        })
        # PostgREST exige as mesmas chaves em todo o lote (PGRST102).
        for o in origens:
            itens.append({
                "baixa_uuid": baixa, "id_parcela": mapa_ids[str(o["fncrt_uuid"])], "papel": "origem",
                "principal": _dinheiro(o["principal"]), "juros": _dinheiro(o["juros"]),
                "multa": _dinheiro(o["multa"]), "desconto": _dinheiro(o["desconto"]),
                "parcela": None, "data_vencimento": None, "valor": None,
            })
        for g in r["gerados"]:
            id_parcela = mapa_ids.get(str(g["fncrt_uuid"]))
            if id_parcela is None:
                continue
            itens.append({
                "baixa_uuid": baixa, "id_parcela": id_parcela, "papel": "gerado",
                "principal": None, "juros": None, "multa": None, "desconto": None,
                "parcela": g["parcela"],
                "data_vencimento": g["data_vencimento"].isoformat() if g["data_vencimento"] else None,
                "valor": _dinheiro(g["valor"]),
            })
    return cabecalhos, itens, puladas


def gravar_renegociacoes(sb: SupabaseRestClient, cabecalhos: list[dict], itens: list[dict]) -> None:
    for i in range(0, len(cabecalhos), LOTE):
        sb.request("POST", "ciclone_renegociacoes", params={"on_conflict": "baixa_uuid"},
                   body=cabecalhos[i : i + LOTE], upsert=True)
    for i in range(0, len(itens), LOTE):
        sb.request("POST", "ciclone_renegociacao_titulos",
                   params={"on_conflict": "baixa_uuid,id_parcela,papel"},
                   body=itens[i : i + LOTE], upsert=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="so mostra o resumo, nao grava nada")
    parser.add_argument("--limit", type=int, default=None, help="limita a N titulos (teste)")
    args = parser.parse_args()

    configurar_log()
    hoje = date.today()

    logger.info("Conectando ao Ciclone...")
    conn_erp = conectar_ciclone()
    try:
        logger.info("Extraindo titulos (empresas %s)...", EMPRESAS)
        linhas_erp = extrair_titulos(conn_erp, limit=args.limit)
        logger.info("Extraindo renegociacoes...")
        renegociacoes = extrair_renegociacoes(conn_erp)
    finally:
        conn_erp.close()
    logger.info("%d titulos extraidos do Ciclone", len(linhas_erp))
    logger.info(
        "%d renegociacoes (%d ativas), %d titulos de origem, %d gerados",
        len(renegociacoes),
        sum(1 for r in renegociacoes if (r["situacao"] or "").strip() == "B"),
        sum(len(r["origens"]) for r in renegociacoes),
        sum(len(r["gerados"]) for r in renegociacoes),
    )

    transformadas = []
    sem_documento = 0
    for row in linhas_erp:
        t = transformar(row, hoje)
        if t is None:
            sem_documento += 1
            continue
        transformadas.append(t)

    resumo: dict = {}
    for t in transformadas:
        resumo[t.banco_dados["status"]] = resumo.get(t.banco_dados["status"], 0) + 1

    logger.info("Resumo por status: %s", resumo)
    valores: dict = {}
    for t in transformadas:
        bd = t.banco_dados
        v = valores.setdefault(bd["status"], {"original": 0.0, "recebido": 0.0, "desconto": 0.0})
        v["original"] += bd["valor_original"]
        v["recebido"] += bd["valor_recebido"]
        v["desconto"] += bd["desconto"]
    logger.info(
        "Valores por status: %s",
        {s: {k: round(x, 2) for k, x in v.items()} for s, v in sorted(valores.items())},
    )
    f_com_saldo = sum(
        1 for r in linhas_erp
        if (r["fncrt_situacao"] or "").strip() == "F" and como_decimal(r["fncrt_saldo"]) > 0
    )
    if f_com_saldo:
        logger.warning(
            "%d titulo(s) com situacao 'F' e saldo > 0 -- tratados como em aberto; conferir no Ciclone.",
            f_com_saldo,
        )
    logger.info("Sem CPF/CNPJ valido (ignorados): %d", sem_documento)

    # Mesmo CPF/CNPJ em mais de um codigo de cliente do Ciclone (cadastro
    # duplicado): o app tem um cadastro por documento, entao vale o ULTIMO na
    # ordem da query (maior pgcln_codigo). So registra quantos divergem.
    cadastros_por_doc: dict = {}
    for t in transformadas:
        cadastros_por_doc.setdefault(t.cliente["documento"], set()).add(
            tuple(t.cliente.get(c) for c in ("nome", *CAMPOS_ERP))
        )
    divergentes = sum(1 for v in cadastros_por_doc.values() if len(v) > 1)
    if divergentes:
        logger.info(
            "%d documento(s) com mais de um cadastro diferente no Ciclone -- vale o de maior codigo",
            divergentes,
        )

    if args.dry_run:
        # Simula a traducao das renegociacoes sem id_parcela real (0 = placeholder).
        documento_por_uuid = {t.banco_dados["codigo_externo"]: t.banco_dados["documento"] for t in transformadas}
        cab, itens, puladas = montar_renegociacoes(
            renegociacoes, {u: 0 for u in documento_por_uuid}, documento_por_uuid
        )
        logger.info(
            "DRY RUN renegociacoes: %d gravaveis (%d ativas), %d origens, %d gerados, %d puladas",
            len(cab), sum(1 for c in cab if c["situacao"] == "ativa"),
            sum(1 for i in itens if i["papel"] == "origem"),
            sum(1 for i in itens if i["papel"] == "gerado"), puladas,
        )
        if cab:
            logger.info("Exemplo de renegociacao: %s", cab[0])
        logger.info("--- DRY RUN: amostra das 5 primeiras linhas transformadas ---")
        for t in transformadas[:5]:
            logger.info(t.banco_dados)
        logger.info("--- DRY RUN: amostra de cadastros (razao social diferente do fantasia) ---")
        amostra = [t.cliente for t in transformadas if t.cliente["razao_social"] != t.cliente["nome"]]
        for c in list({c["documento"]: c for c in amostra}.values())[:3]:
            logger.info(c)
        logger.info("Nenhuma escrita feita (dry-run).")
        return

    logger.info("Conectando ao Supabase do Cobranca...")
    sb = conectar_cobranca()

    uuids = [t.banco_dados["codigo_externo"] for t in transformadas]
    logger.info("Resolvendo id_parcela para %d titulos...", len(uuids))
    mapa_ids = resolver_ids_parcela(sb, uuids)

    clientes_por_documento = {}
    codigos_por_documento: dict = {}
    linhas_banco_dados = []
    for t in transformadas:
        id_parcela = mapa_ids.get(t.banco_dados["codigo_externo"])
        if id_parcela is None:
            logger.warning("id_parcela nao resolvido para %s, pulando", t.banco_dados["codigo_externo"])
            continue
        linha = dict(t.banco_dados)
        linha["id_parcela"] = id_parcela
        linhas_banco_dados.append(linha)
        doc = t.cliente["documento"]
        clientes_por_documento[doc] = t.cliente
        codigos_por_documento.setdefault(doc, set()).add(t.cliente.get("codigo_cliente_erp"))
    # O ultimo titulo lido de cada documento define o cadastro; o codigo do
    # Ciclone, porem, junta todos os codigos daquele CPF/CNPJ.
    for doc, cliente in clientes_por_documento.items():
        clientes_por_documento[doc] = {
            **cliente,
            "codigo_cliente_erp": juntar_codigos_cliente(codigos_por_documento.get(doc, set())),
        }

    logger.info("Gravando %d clientes...", len(clientes_por_documento))
    upsert_clientes(sb, clientes_por_documento)

    logger.info("Gravando %d linhas em BANCO_DADOS...", len(linhas_banco_dados))
    upsert_banco_dados(sb, linhas_banco_dados)

    # Depois do BANCO_DADOS: os itens tem FK para ele. Falha aqui nao desfaz
    # nem invalida a carga dos titulos -- loga e segue (proxima rodada refaz,
    # o upsert e idempotente).
    documento_por_uuid = {
        t.banco_dados["codigo_externo"]: t.banco_dados["documento"] for t in transformadas
    }
    cabecalhos, itens, puladas = montar_renegociacoes(renegociacoes, mapa_ids, documento_por_uuid)
    logger.info(
        "Gravando %d renegociacoes e %d titulos de renegociacao (%d puladas: sem titulo conhecido pelo app)...",
        len(cabecalhos), len(itens), puladas,
    )
    try:
        gravar_renegociacoes(sb, cabecalhos, itens)
    except RuntimeError as exc:
        logger.error("Falha ao gravar renegociacoes (titulos ja gravados): %s", exc)
        logger.info("Sincronizacao concluida COM ERRO nas renegociacoes.")
        sys.exit(1)

    logger.info("Sincronizacao concluida.")


if __name__ == "__main__":
    main()
