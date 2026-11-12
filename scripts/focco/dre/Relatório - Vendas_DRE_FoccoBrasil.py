from __future__ import annotations

import argparse
import os
from getpass import getpass
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, cast

import pandas as pd
import psycopg2


SQL_DATE_PATTERN = re.compile(
    r"(WITH\s+parametros\s+AS\s*\(\s*SELECT\s*DATE\s*)'[^']+'(\s+AS\s+p_data_inicio,\s*DATE\s*)'[^']+'(\s+AS\s+p_data_fim)",
    re.IGNORECASE | re.DOTALL,
)

# Pasta base (sem o ano). O ano é acrescentado dinamicamente conforme o
# período processado — veja build_output_path.
DEFAULT_OUTPUT_BASE_DIR = Path(r"\\ciclone\Power BI - FoccoBrasil\Focco Brasil\Vendas\fVendas")

# Código fixo que compõe o nome dos arquivos: MM_AAAA_107053.csv
REPORT_CODE = "107053"


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


def default_previous_month() -> tuple[date, date]:
    today = date.today()
    first_day_this_month = date(today.year, today.month, 1)
    last_day_previous_month = first_day_this_month - timedelta(days=1)
    first_day_previous_month = date(last_day_previous_month.year, last_day_previous_month.month, 1)
    return first_day_previous_month, last_day_previous_month


def parse_iso_date(value: str | None, fallback: date) -> date:
    if not value:
        return fallback

    normalized_value = value.strip()
    for date_format in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(normalized_value, date_format).date()
        except ValueError:
            continue

    raise ValueError(
        f"Formato de data inválido: {value!r}. Use DD/MM/AAAA ou AAAA-MM-DD."
    )


def read_sql_template(sql_path: Path) -> str:
    return sql_path.read_text(encoding="utf-8")


def render_sql(sql_template: str, start_date: date, end_date: date) -> str:
    def replacement(match: re.Match[str]) -> str:
        return (
            f"{match.group(1)}'" + start_date.strftime("%Y-%m-%d") + f"'{match.group(2)}'"
            + end_date.strftime("%Y-%m-%d")
            + f"'{match.group(3)}"
        )

    rendered_sql, substitutions = SQL_DATE_PATTERN.subn(replacement, sql_template, count=1)
    if substitutions != 1:
        raise ValueError(
            "Não encontrei o bloco de datas esperado no arquivo SQL. "
            "Verifique se o CTE 'parametros' continua com as datas fixas no topo do arquivo."
        )
    return rendered_sql


def read_database_config() -> DatabaseConfig:
    host = os.getenv("PGHOST") or input("Host PostgreSQL: ").strip()
    database = os.getenv("PGDATABASE") or input("Banco de dados PostgreSQL: ").strip()
    user = os.getenv("PGUSER") or input("Usuário PostgreSQL: ").strip()
    password = os.getenv("PGPASSWORD") or getpass("Senha PostgreSQL: ")
    port_text = os.getenv("PGPORT", "5432")
    sslmode = os.getenv("PGSSLMODE") or None

    if not host or not database or not user or not password:
        raise ValueError(
            "As informações de conexão são obrigatórias. "
            "Preencha PGHOST, PGDATABASE, PGUSER e PGPASSWORD no .env ou informe quando o script pedir."
        )

    return DatabaseConfig(
        host=host,
        port=int(port_text),
        database=database,
        user=user,
        password=password,
        sslmode=sslmode,
    )


def build_output_path(reference_date: date, provided_path: str | None) -> Path:
    if provided_path:
        return Path(provided_path).expanduser().resolve()

    # A pasta é baseada no ANO DO PERÍODO processado (não no ano atual).
    # Ex.: período de dez/2026 -> pasta "2026"; período de jan/2027 -> pasta "2027".
    output_dir = DEFAULT_OUTPUT_BASE_DIR / f"{reference_date:%Y}"
    output_dir.mkdir(parents=True, exist_ok=True)
    # Padrão de nome: MM_AAAA_107053.csv (ex.: 12_2026_107053.csv).
    filename = f"{reference_date:%m_%Y}_{REPORT_CODE}.csv"
    return output_dir / filename


def write_dataframe_to_csv(dataframe: pd.DataFrame, output_path: Path) -> None:
    dataframe.to_csv(output_path, index=False, sep=";", encoding="utf-8-sig")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Executa o SQL de vendas e salva o resultado em CSV."
    )
    parser.add_argument(
        "--sql-file",
        default="Relatório - Vendas_DRE_FoccoBrasil.sql",
        help="Arquivo SQL a executar.",
    )
    parser.add_argument(
        "--output",
        help="Caminho do CSV de saída. Se omitido, salva na pasta de rede padrão (pasta do ano do período).",
    )
    parser.add_argument(
        "--inicio",
        help="Data inicial em formato DD/MM/AAAA ou AAAA-MM-DD. Padrão: primeiro dia do mês anterior.",
    )
    parser.add_argument(
        "--fim",
        help="Data final em formato DD/MM/AAAA ou AAAA-MM-DD. Padrão: último dia do mês anterior.",
    )
    parser.add_argument(
        "--env-file",
        default="../../../.env",  # .env do repositório
        help="Arquivo com variáveis de conexão no formato KEY=VALUE.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Mostra a consulta renderizada sem conectar ao banco.",
    )

    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parent
    sql_path = (base_dir / args.sql_file).resolve()
    if not sql_path.exists():
        raise FileNotFoundError(f"Arquivo SQL não encontrado: {sql_path}")

    load_env_file((base_dir / args.env_file).resolve())

    # O relatório sempre gera os dados do mês anterior ao mês atual.
    # default_previous_month() já trata corretamente a virada de ano.
    default_start, default_end = default_previous_month()
    start_date = parse_iso_date(args.inicio, default_start)
    end_date = parse_iso_date(args.fim, default_end)

    sql_template = read_sql_template(sql_path)
    rendered_sql = render_sql(sql_template, start_date, end_date)

    # A pasta de destino e o nome do arquivo derivam do período processado
    # (start_date = primeiro dia do mês de referência).
    csv_output_path = build_output_path(start_date, args.output)

    if args.dry_run:
        print(f"SQL carregado de: {sql_path}")
        print(f"Período: {start_date:%Y-%m-%d} até {end_date:%Y-%m-%d}")
        print(f"CSV de saída: {csv_output_path}")
        print("Prévia da consulta:")
        print(rendered_sql[:1500])
        return 0

    config = read_database_config()
    dsn_parts = [
        f"host={config.host}",
        f"port={config.port}",
        f"dbname={config.database}",
        f"user={config.user}",
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
            columns = [cast(str, column[0]) for column in description]
            dataframe = pd.DataFrame(rows, columns=columns)

    write_dataframe_to_csv(dataframe, csv_output_path)

    print(f"Linhas exportadas: {len(dataframe)}")
    print(f"CSV gerado em: {csv_output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
