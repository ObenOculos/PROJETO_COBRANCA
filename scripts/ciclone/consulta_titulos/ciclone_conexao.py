# -*- coding: utf-8 -*-
"""
Conexao somente-leitura com o banco do Ciclone (ERP, PostgreSQL), usada
pela Consulta de Titulos do Cliente (consulta_titulos_cliente.py).

Credenciais: ERP_* do .env da raiz do repositorio (mesmo lugar do
scripts/ciclone/sync_financeiro.py). Nada de senha nesta pasta.

Uso:
    from ciclone_conexao import conectar
    conn = conectar()
    ...
    conn.close()
"""

from pathlib import Path

# scripts/ciclone/consulta_titulos/ -> raiz do repositorio
CAMINHO_ENV = Path(__file__).resolve().parents[3] / ".env"


def ler_env(caminho: Path = CAMINHO_ENV) -> dict:
    cfg = {}
    with open(caminho, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                cfg[k.strip()] = v.strip().strip('"').strip("'")
    return cfg


def conectar(caminho_env: Path = CAMINHO_ENV):
    """Abre conexao somente-leitura (default_transaction_read_only=on)."""
    import psycopg2

    cfg = ler_env(caminho_env)
    return psycopg2.connect(
        host=cfg["ERP_HOST"],
        port=int(cfg.get("ERP_PORT", 5432)),
        dbname=cfg.get("ERP_DATABASE", "ciclone"),
        user=cfg["ERP_USER"],
        password=cfg["ERP_PASSWORD"],
        client_encoding=cfg.get("ERP_ENCODING", "WIN1252"),
        connect_timeout=int(cfg.get("ERP_TIMEOUT", 15)),
        options="-c default_transaction_read_only=on",
    )
