from __future__ import annotations

import argparse
import os
from getpass import getpass
import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, cast

import pandas as pd
import psycopg2


SQL_DATE_PATTERN = re.compile(
    r"(DATE\s*)'[^']+'(\s+AS\s+p_data_inicio,\s*DATE\s*)'[^']+'(\s+AS\s+p_data_fim)",
    re.IGNORECASE | re.DOTALL,
)

DEFAULT_REPORT_START = date(date.today().year, 1, 1)
DEFAULT_REPORT_END   = date(date.today().year, 12, 31)

_BASE_OUTPUT_DIR = Path(r"\\ciclone\Power BI - FoccoBrasil\Focco Brasil\DRE")


def _output_dir() -> Path:
    return _BASE_OUTPUT_DIR / str(date.today().year)


def _output_filename() -> str:
    return f"Bonus e Perca_{date.today().year}.csv"


@dataclass(frozen=True)
class DatabaseConfig:
    host: str
    port: int
    database: str
    user: str
    password: str
    sslmode: str | None = None


def load_env_file(env_path: Path) -> None:
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def parse_iso_date(value: str | None, fallback: date) -> date:
    if not value:
        return fallback
    normalized = value.strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(normalized, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Formato de data inválido: {value!r}. Use DD/MM/AAAA ou AAAA-MM-DD.")


def read_sql_template(sql_path: Path) -> str:
    # utf-8-sig remove automaticamente o BOM (\ufeff) caso o arquivo tenha sido
    # salvo com BOM (comum em editores Windows como Notepad e SSMS).
    return sql_path.read_text(encoding="utf-8-sig")


def render_sql(sql_template: str, start_date: date, end_date: date) -> str:
    def replacement(match: re.Match[str]) -> str:
        return (
            f"{match.group(1)}'" + start_date.strftime("%Y-%m-%d") + f"'{match.group(2)}'"
            + end_date.strftime("%Y-%m-%d") + f"'{match.group(3)}"
        )
    rendered, substitutions = SQL_DATE_PATTERN.subn(replacement, sql_template, count=1)
    if substitutions != 1:
        raise ValueError(
            "Não encontrei o bloco de datas esperado no arquivo SQL. "
            "Verifique se o CTE 'parametros' continua com as datas fixas no topo do arquivo."
        )
    return rendered


def read_database_config() -> DatabaseConfig:
    host     = os.getenv("PGHOST")     or input("Host PostgreSQL: ").strip()
    database = os.getenv("PGDATABASE") or input("Banco de dados PostgreSQL: ").strip()
    user     = os.getenv("PGUSER")     or input("Usuário PostgreSQL: ").strip()
    password = os.getenv("PGPASSWORD") or getpass("Senha PostgreSQL: ")
    port_text = os.getenv("PGPORT", "5432")
    sslmode  = os.getenv("PGSSLMODE") or None

    if not host or not database or not user or not password:
        raise ValueError(
            "As informações de conexão são obrigatórias. "
            "Preencha PGHOST, PGDATABASE, PGUSER e PGPASSWORD no .env."
        )
    return DatabaseConfig(
        host=host, port=int(port_text), database=database,
        user=user, password=password, sslmode=sslmode,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Executa o SQL de Bônus e Perça e salva o resultado em CSV."
    )
    parser.add_argument("--sql-file", default="Relatório - Bonus e Perca.sql",
                        help="Arquivo SQL a executar.")
    parser.add_argument("--output",   help="Caminho completo de saída (.csv). Padrão: pasta de rede.")
    parser.add_argument("--inicio",   help="Data inicial DD/MM/AAAA ou AAAA-MM-DD.")
    parser.add_argument("--fim",      help="Data final DD/MM/AAAA ou AAAA-MM-DD.")
    parser.add_argument("--env-file", default="../../../.env",  # .env do repositório
                        help="Arquivo .env com variáveis de conexão.")
    parser.add_argument("--dry-run",  action="store_true",
                        help="Exibe a consulta renderizada sem conectar ao banco.")
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parent
    sql_path = (base_dir / args.sql_file).resolve()
    if not sql_path.exists():
        raise FileNotFoundError(f"Arquivo SQL não encontrado: {sql_path}")

    load_env_file((base_dir / args.env_file).resolve())

    start_date = parse_iso_date(args.inicio, DEFAULT_REPORT_START)
    end_date   = parse_iso_date(args.fim,    DEFAULT_REPORT_END)

    sql_template = read_sql_template(sql_path)
    rendered_sql = render_sql(sql_template, start_date, end_date)

    if args.output:
        output_path = Path(args.output).expanduser().resolve()
    else:
        out_dir = _output_dir()
        out_dir.mkdir(parents=True, exist_ok=True)
        output_path = out_dir / _output_filename()

    if args.dry_run:
        print(f"SQL carregado de : {sql_path}")
        print(f"Período          : {start_date:%Y-%m-%d} até {end_date:%Y-%m-%d}")
        print(f"Arquivo de saída : {output_path}")
        print("Prévia da consulta:")
        print(rendered_sql[:1500])
        return 0

    config = read_database_config()
    dsn_parts = [
        f"host={config.host}", f"port={config.port}",
        f"dbname={config.database}", f"user={config.user}",
        f"password={config.password}",
    ]
    if config.sslmode:
        dsn_parts.append(f"sslmode={config.sslmode}")

    connection: Any = psycopg2.connect(" ".join(dsn_parts))
    with connection:
        with connection.cursor() as cursor:
            cursor.execute(rendered_sql)
            rows = cursor.fetchall()
            description = cast(tuple[tuple[Any, ...], ...], cursor.description or ())
            columns = [cast(str, col[0]) for col in description]
            dataframe = pd.DataFrame(rows, columns=columns)

    dataframe.to_csv(output_path, index=False, sep=";", encoding="utf-8-sig")

    print(f"Linhas exportadas : {len(dataframe)}")
    print(f"CSV gerado em     : {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
