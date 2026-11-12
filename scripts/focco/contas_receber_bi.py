"""
Contas a receber da Focco -> Power BI (todo dia, 19h).

Lê a planilha mestre protegida por senha
  Dropbox/.../Arquivos_Atualizados/1 - Banco_de_Dados/Focco/_CONTAS A RECEBER OBEN.xlsx
(aba CTAS_RECEBER), filtra vendas de nov/2021 em diante, numera as parcelas,
separa os telefones, formata datas/CPF/código do cliente e grava no layout
fixo do Power BI:
  \\ciclone\Power BI - FoccoBrasil\Focco Brasil\Contas a Receber\BD_Contasareceber_OBEN.xlsx

Unifica (2026-11-12) duas rotinas que gravavam o MESMO arquivo do Power BI:
  - Dropbox/.../5 - Scripts/1 - Salvar_Arquivo_Sem_Senha.py (processo do
    Cedrus, 9h30) -- é esta versão: layout fixo, PARCELA, telefones;
  - Empresa_Oben/.../Arquivo_Matriz/Salvar_Arquivo_Sem_Senha.py (tarefa
    Atualizar_BI, 19h) -- versão antiga, sem PARCELA, que sobrescrevia a outra.
Mudou: senha da planilha no .env do repositório (FOCCO_PLANILHA_SENHA), origem
fixa (sem perguntas no terminal), log em scripts/focco/saida. Os arquivos
_Inadimplentes/_Baixa (entrada do Cedrus, que acaba em 15/11/2026) só saem
com --cedrus.

Uso:
    python scripts/focco/contas_receber_bi.py            # só o arquivo do Power BI
    python scripts/focco/contas_receber_bi.py --cedrus   # ... e os do Cedrus no Dropbox
"""

import io
import os
import sys
from pathlib import Path
from typing import List, Optional, Tuple
import logging
import re

import msoffcrypto
import pandas as pd


PASTA_SCRIPT = Path(__file__).resolve().parent
REPO = PASTA_SCRIPT.parent.parent
PASTA_LOGS = PASTA_SCRIPT / "saida"
PASTA_LOGS.mkdir(exist_ok=True)

ORIGEM = Path(r"C:\Users\User\Dropbox\5. DNA COBRANÇA GERAL\Cobrança_Focco\Arquivos_Atualizados"
              r"\1 - Banco_de_Dados\Focco\_CONTAS A RECEBER OBEN.xlsx")


def _senha_planilha() -> str:
    valor = os.getenv("FOCCO_PLANILHA_SENHA")
    env = REPO / ".env"
    if not valor and env.exists():
        for linha in env.read_text(encoding="utf-8-sig").splitlines():
            if linha.strip().startswith("FOCCO_PLANILHA_SENHA="):
                valor = linha.split("=", 1)[1].strip().strip('"').strip("'")
    if not valor:
        raise SystemExit(f"FOCCO_PLANILHA_SENHA não encontrada em {env}")
    return valor


class PathResolver:
    """Origem fixa: a tarefa agendada não pode parar esperando resposta."""

    def get_arquivo_origem(self) -> Path:
        return ORIGEM

    def get_pasta_destino(self) -> Path:
        return ORIGEM.parent


class Config:
    """Configurações do sistema."""

    def __init__(self, path_resolver: PathResolver = None):
        self.path_resolver = path_resolver or PathResolver()

        self.SENHA_ABERTURA = _senha_planilha()
        self.NOME_ABA = "CTAS_RECEBER"

        self.ARQUIVO_COMPLETO = "BD_Contasareceber_OBEN.xlsx"
        self.ARQUIVO_INADIMPLENTES = "BD_Contasareceber_OBEN_Inadimplentes.xlsx"
        self.ARQUIVO_BAIXA = "BD_Contasareceber_OBEN_Baixa.xlsx"

        self.PASTA_POWERBI = Path(r"\\ciclone\Power BI - FoccoBrasil\Focco Brasil\Contas a Receber")

        self.LINHA_CABECALHO = 2  # Linha 3 (0-based)
        self.ANO_FILTRO_BASE = 2021
        self.MESES_FILTRO = [11, 12]  # Nov/Dez

        self.COLUNAS_OBRIGATORIAS = ['DATA_VENDA', 'DATA_PAGAMENTO', 'ID_PLANILHA']

        # Layout FIXO do arquivo lido pelo Power BI. Mesmo que a exportação de origem
        # ganhe, perca ou reordene colunas, o BD_Contasareceber_OBEN.xlsx sai sempre assim:
        # colunas ausentes na origem saem vazias; colunas extras são descartadas (com aviso no log).
        self.COLUNAS_SAIDA_POWERBI = [
            'CARTEIRA', 'CIDADE', 'ESTADO', 'PEDIDO', 'COD_CLIENTE', 'ID_PLANILHA',
            'RAZÃO', 'FANTASIA', 'CNPJ/CPF', 'EMAIL', 'CONTATO', 'CONTATO_02',
            'DATA_VENDA', 'VENCIMENTO', 'VALOR_TÍTULO', 'DATA_PAGAMENTO', 'DATA_ATUAL',
            'ATRASO', 'MULTA', 'JUROS', 'CUSTAS', 'VENDEDOR', 'COBRADOR',
            'EXCLUSÃO_SPC', 'INCLUSÃO_NO_SPC', 'DATA_RETORNO', 'OBSERVAÇÃO', 'PARCELA',
        ]
        self.COLUNAS_DATA = ['DATA_VENDA', 'VENCIMENTO', 'DATA_ATUAL', 'DATA_PAGAMENTO']
        self.COLUNA_CPF_CNPJ = 'CNPJ/CPF'
        self.COLUNA_CONTATO = 'CONTATO'
        self.COLUNA_CONTATO_02 = 'CONTATO_02'
        self.COLUNA_COD_CLIENTE = 'COD_CLIENTE'

    @property
    def ARQUIVO_ORIGEM(self) -> Path:
        return self.path_resolver.get_arquivo_origem()

    @property
    def PASTA_DESTINO(self) -> Path:
        return self.path_resolver.get_pasta_destino()


class ExcelExtractorError(Exception):
    """Exceção personalizada para erros do extrator."""
    pass


class DocumentFormatter:
    """Formatador de documentos CPF e CNPJ."""

    @staticmethod
    def limpar_documento(doc: str) -> str:
        if pd.isna(doc) or doc is None:
            return ""
        return re.sub(r'\D', '', str(doc))

    @staticmethod
    def formatar_cpf(cpf: str) -> str:
        if len(cpf) == 11 and cpf.isdigit():
            return f"{cpf[:3]}.{cpf[3:6]}.{cpf[6:9]}-{cpf[9:]}"
        return cpf

    @staticmethod
    def formatar_cnpj(cnpj: str) -> str:
        if len(cnpj) == 14 and cnpj.isdigit():
            return f"{cnpj[:2]}.{cnpj[2:5]}.{cnpj[5:8]}/{cnpj[8:12]}-{cnpj[12:]}"
        return cnpj

    @staticmethod
    def formatar_cpf_cnpj(documento: str) -> str:
        """Detecta e formata CPF (11 dígitos) ou CNPJ (14 dígitos)."""
        if not documento or documento == "":
            return ""

        doc_limpo = documento.strip()

        if len(doc_limpo) == 11:
            return DocumentFormatter.formatar_cpf(doc_limpo)
        elif len(doc_limpo) == 14:
            return DocumentFormatter.formatar_cnpj(doc_limpo)
        else:
            return doc_limpo


class ExcelExtractor:
    """Extrator de dados Excel com separação por status de pagamento."""

    def __init__(self, config: Config = None):
        self.config = config or Config()
        self._setup_logging()

    def _setup_logging(self) -> None:
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.StreamHandler(),
                logging.FileHandler(PASTA_LOGS / 'excel_extractor.log', encoding='utf-8')
            ]
        )
        self.logger = logging.getLogger(__name__)

    def _decrypt_file(self, file_path: Path) -> io.BytesIO:
        """Descriptografa o Excel protegido por senha."""
        try:
            with open(file_path, 'rb') as file:
                office_file = msoffcrypto.OfficeFile(file)

                if office_file.is_encrypted():
                    self.logger.info("[CHAVE] Aplicando senha de abertura...")
                    office_file.load_key(password=self.config.SENHA_ABERTURA)
                    decrypted = io.BytesIO()
                    office_file.decrypt(decrypted)
                    decrypted.seek(0)
                    return decrypted
                else:
                    self.logger.info("[ARQUIVO] Arquivo não criptografado")
                    decrypted = io.BytesIO(file.read())
                    decrypted.seek(0)
                    return decrypted

        except Exception as e:
            raise ExcelExtractorError(f"Erro ao descriptografar arquivo: {e}")

    def _load_excel_data(self, decrypted_file: io.BytesIO) -> pd.DataFrame:
        """Carrega dados da aba configurada."""
        try:
            self.logger.info(f"[DADOS] Lendo aba '{self.config.NOME_ABA}'...")

            df = pd.read_excel(
                decrypted_file,
                sheet_name=self.config.NOME_ABA,
                header=self.config.LINHA_CABECALHO,
                engine='openpyxl'
            )

            if df.empty:
                raise ExcelExtractorError(f"Aba '{self.config.NOME_ABA}' está vazia")

            # Remove espaços invisíveis dos nomes de coluna ("CUSTAS " -> "CUSTAS")
            df.columns = [str(c).strip() for c in df.columns]

            self.logger.info(f"[DADOS] Dados carregados: {len(df):,} registros")
            return df

        except Exception as e:
            raise ExcelExtractorError(f"Erro ao carregar dados: {e}")

    def _validate_columns(self, df: pd.DataFrame) -> None:
        missing_columns = [col for col in self.config.COLUNAS_OBRIGATORIAS
                          if col not in df.columns]

        if missing_columns:
            available_cols = list(df.columns)
            error_msg = (
                f"Colunas obrigatórias ausentes: {missing_columns}\n"
                f"Colunas disponíveis: {available_cols}"
            )
            raise ExcelExtractorError(error_msg)

    @staticmethod
    def _normalizar_cod_cliente(valor) -> str:
        """Normaliza COD_CLIENTE para o formato XXX.XXX (zero-fill em 6 dígitos)."""
        if pd.isna(valor) or str(valor).strip() == '':
            return ''

        s = str(valor).strip()

        # Remove '.0' de floats lidos como string ("102166.0" -> "102166")
        if s.endswith('.0') and s[:-2].isdigit():
            s = s[:-2]

        # Remove ponto de separador já existente ("000.041" -> "000041")
        s = s.replace('.', '')

        if s.isdigit():
            s = s.zfill(6)
            return f"{s[:3]}.{s[3:]}"

        return str(valor).strip()

    def _format_cod_cliente_column(self, df: pd.DataFrame) -> pd.DataFrame:
        """Aplica normalização XXX.XXX na coluna COD_CLIENTE."""
        col = self.config.COLUNA_COD_CLIENTE
        if col in df.columns:
            self.logger.info(f"[FORMATO] Normalizando coluna '{col}' para XXX.XXX...")
            df[col] = df[col].apply(self._normalizar_cod_cliente)
        return df

    def _apply_date_filter(self, df: pd.DataFrame) -> pd.DataFrame:
        """Filtra Nov/Dez 2021 + todos os anos posteriores."""
        self.logger.info("[FILTRO] Aplicando filtro de data...")

        df['DATA_VENDA'] = pd.to_datetime(df['DATA_VENDA'], errors='coerce')
        df = df.dropna(subset=['DATA_VENDA'])

        filtro_2021 = (
            (df['DATA_VENDA'].dt.year == self.config.ANO_FILTRO_BASE) &
            (df['DATA_VENDA'].dt.month.isin(self.config.MESES_FILTRO))
        )
        filtro_anos_posteriores = (
            df['DATA_VENDA'].dt.year >= (self.config.ANO_FILTRO_BASE + 1)
        )

        df_filtrado = df[filtro_2021 | filtro_anos_posteriores].copy()

        registros_removidos = len(df) - len(df_filtrado)
        self.logger.info(f"[FILTRO] Registros após filtro: {len(df_filtrado):,}")
        self.logger.info(f"[FILTRO] Registros removidos: {registros_removidos:,}")

        if not df_filtrado.empty:
            data_min = df_filtrado['DATA_VENDA'].min()
            data_max = df_filtrado['DATA_VENDA'].max()
            self.logger.info(f"[PERIODO] Período: {data_min:%d/%m/%Y} a {data_max:%d/%m/%Y}")

        return df_filtrado

    def _format_contatos(self, df: pd.DataFrame) -> pd.DataFrame:
        """Separa múltiplos telefones (delimitados por '|') em CONTATO e CONTATO_02."""
        if df.empty:
            return df

        df_formatted = df.copy()
        col_contato = self.config.COLUNA_CONTATO
        col_contato2 = self.config.COLUNA_CONTATO_02

        if col_contato in df_formatted.columns:
            self.logger.info(f"[FORMATO] Separando múltiplos telefones na coluna '{col_contato}'...")

            df_formatted[col_contato] = df_formatted[col_contato].fillna('').astype(str).replace(['nan', 'None'], '')

            if col_contato2 not in df_formatted.columns:
                df_formatted[col_contato2] = ''
            else:
                df_formatted[col_contato2] = df_formatted[col_contato2].fillna('').astype(str).replace(['nan', 'None'], '')

            mask = df_formatted[col_contato].str.contains(r'\|', na=False)

            if mask.any():
                split_cols = df_formatted.loc[mask, col_contato].str.split(r'\s*\|\s*', expand=True)

                df_formatted.loc[mask, col_contato] = split_cols[0].str.strip()

                if split_cols.shape[1] > 1:
                    df_formatted.loc[mask, col_contato2] = split_cols[1].str.strip()

                if split_cols.shape[1] > 2:
                    extras = split_cols.shape[1] - 2
                    self.logger.warning(
                        f"[FORMATO] {mask.sum()} linha(s) têm mais de 2 telefones. "
                        f"{extras} número(s) extra(s) ignorados por linha."
                    )

            self.logger.info("[FORMATO] Separação de contatos concluída.")

        return df_formatted

    def _adicionar_numeracao_parcelas(self, df: pd.DataFrame) -> pd.DataFrame:
        """Numera parcelas por título (ID_PLANILHA), ordenando por VENCIMENTO crescente."""
        if df.empty:
            return df

        df_numerado = df.copy()

        if 'VENCIMENTO' not in df_numerado.columns:
            self.logger.warning("[PARCELA] Coluna VENCIMENTO ausente. Numerando só por título.")
            df_numerado['PARCELA'] = df_numerado.groupby('ID_PLANILHA').cumcount() + 1
            return df_numerado

        self.logger.info("[PARCELA] Numerando parcelas por VENCIMENTO (crescente)...")

        df_numerado['_vencimento_dt'] = pd.to_datetime(
            df_numerado['VENCIMENTO'], dayfirst=True, errors='coerce'
        )

        df_numerado = df_numerado.sort_values(
            by=['ID_PLANILHA', '_vencimento_dt'], na_position='last'
        ).reset_index(drop=True)

        df_numerado['PARCELA'] = df_numerado.groupby('ID_PLANILHA').cumcount() + 1
        df_numerado['PARCELA'] = df_numerado['PARCELA'].astype(str)
        df_numerado = df_numerado.drop(columns=['_vencimento_dt'])

        titulos_multiplas = (df_numerado.groupby('ID_PLANILHA').size() > 1).sum()
        self.logger.info(f"[PARCELA] Títulos com múltiplas parcelas: {titulos_multiplas}")

        return df_numerado

    def _padronizar_colunas_powerbi(self, df: pd.DataFrame) -> pd.DataFrame:
        """Força o layout fixo esperado pelo Power BI (nomes e ordem das colunas)."""
        esperadas = self.config.COLUNAS_SAIDA_POWERBI
        faltando = [c for c in esperadas if c not in df.columns]
        extras = [c for c in df.columns if c not in esperadas]

        if faltando:
            self.logger.warning(f"[LAYOUT] Colunas ausentes na origem (sairão vazias): {faltando}")
        if extras:
            self.logger.warning(f"[LAYOUT] Colunas novas na origem (descartadas do arquivo do Power BI): {extras}")
        if not faltando and not extras:
            self.logger.info("[LAYOUT] Layout da origem igual ao esperado.")

        return df.reindex(columns=esperadas)

    def _separate_by_payment_status(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Inadimplentes = todos; Baixa = apenas com DATA_PAGAMENTO."""
        self.logger.info("[SEPARACAO] Separando por status de pagamento...")

        com_pagamento = ~(
            df['DATA_PAGAMENTO'].isna() |
            df['DATA_PAGAMENTO'].isnull() |
            (df['DATA_PAGAMENTO'].astype(str).str.strip().isin(['', 'nan']))
        )

        df_inadimplentes = df.copy()
        df_baixa = df[com_pagamento].copy()

        self.logger.info(f"[INADIMPLENTES] Total: {len(df_inadimplentes):,}")
        self.logger.info(f"[BAIXA] Pagos: {len(df_baixa):,}")

        return df_inadimplentes, df_baixa

    def _format_date_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Formata colunas de data para DD/MM/YYYY."""
        if df.empty:
            return df

        df_formatted = df.copy()

        for coluna in self.config.COLUNAS_DATA:
            if coluna in df_formatted.columns:
                col = df_formatted[coluna]

                if pd.api.types.is_datetime64_any_dtype(col):
                    df_formatted[coluna] = col.dt.strftime('%d/%m/%Y')
                elif col.dtype == object:
                    df_formatted[coluna] = pd.to_datetime(
                        col, errors='coerce', dayfirst=True
                    ).dt.strftime('%d/%m/%Y')
                else:
                    df_formatted[coluna] = pd.to_datetime(
                        col, errors='coerce'
                    ).dt.strftime('%d/%m/%Y')

        return df_formatted

    def _format_cpf_cnpj_column(self, df: pd.DataFrame) -> pd.DataFrame:
        """Limpa e formata a coluna CNPJ/CPF de forma uniforme."""
        if df.empty:
            return df

        df_formatted = df.copy()

        if self.config.COLUNA_CPF_CNPJ in df_formatted.columns:
            self.logger.info(f"[FORMATO] Formatando coluna '{self.config.COLUNA_CPF_CNPJ}'...")

            df_formatted[self.config.COLUNA_CPF_CNPJ] = df_formatted[self.config.COLUNA_CPF_CNPJ].apply(
                DocumentFormatter.limpar_documento
            )
            df_formatted[self.config.COLUNA_CPF_CNPJ] = df_formatted[self.config.COLUNA_CPF_CNPJ].apply(
                DocumentFormatter.formatar_cpf_cnpj
            )

            self.logger.info("[FORMATO] Formatação de CNPJ/CPF concluída")
        else:
            self.logger.warning(f"[AVISO] Coluna '{self.config.COLUNA_CPF_CNPJ}' não encontrada")

        return df_formatted

    def _ensure_directory(self, path: Path) -> Path:
        try:
            if path.exists() and path.is_dir():
                return path
            else:
                path.mkdir(parents=True, exist_ok=True)
                return path
        except Exception as e:
            self.logger.warning(f"[AVISO] Erro ao criar diretório {path}: {e}")
            self.logger.info("[FALLBACK] Usando diretório atual")
            return Path.cwd()

    def _save_dataframe(self, df: pd.DataFrame, file_path: Path, sheet_name: str) -> None:
        """Salva o DataFrame em Excel, formatando CNPJ/CPF e COD_CLIENTE como texto."""
        if df.empty:
            self.logger.warning(f"[AVISO] DataFrame vazio, pulando {file_path.name}")
            return

        # Grava num temporário e só depois substitui o arquivo final. Assim o Power BI
        # nunca lê um arquivo pela metade. O nome não começa com "BD_Contasareceber",
        # então as consultas do Power BI ignoram o temporário.
        tmp_path = file_path.with_name(f"~tmp_{file_path.name}")
        try:
            from openpyxl.styles import Alignment

            with pd.ExcelWriter(tmp_path, engine='openpyxl') as writer:
                df.to_excel(writer, sheet_name=sheet_name, index=False)
                worksheet = writer.sheets[sheet_name]

                # Colunas a forçar como texto alinhado à esquerda
                colunas_texto = [self.config.COLUNA_CPF_CNPJ, self.config.COLUNA_COD_CLIENTE]
                for coluna in colunas_texto:
                    if coluna in df.columns:
                        col_idx = df.columns.get_loc(coluna) + 1
                        col_letter = worksheet.cell(1, col_idx).column_letter
                        for row in range(2, len(df) + 2):
                            cell = worksheet[f'{col_letter}{row}']
                            cell.number_format = '@'
                            cell.alignment = Alignment(horizontal='left')

            os.replace(tmp_path, file_path)
            self.logger.info(f"[SUCESSO] Arquivo salvo: {file_path}")

        except PermissionError as e:
            raise ExcelExtractorError(
                f"Sem permissão para substituir {file_path} (arquivo aberto no Excel?): {e}"
            )
        except Exception as e:
            raise ExcelExtractorError(f"Erro ao salvar {file_path}: {e}")
        finally:
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass

    def _log_summary(self, df_completo: pd.DataFrame, df_inadimplentes: pd.DataFrame,
                     df_baixa: pd.DataFrame, output_dir: Path, output_dir_completo: Path) -> None:
        self.logger.info("\n" + "="*60)
        self.logger.info("[RESUMO] RESUMO DA EXTRAÇÃO")
        self.logger.info("="*60)
        self.logger.info(f"[ABA] Aba: '{self.config.NOME_ABA}'")
        self.logger.info("[FILTRO] Filtro: Nov/Dez 2021 + 2022 em diante")
        self.logger.info(f"[PASTA] Diretório (Inadimpl./Baixa): {output_dir}")
        self.logger.info(f"[REDE] Diretório (Completo): {output_dir_completo}")

        if not df_completo.empty:
            self.logger.info(f"[COMPLETO] Completo: {len(df_completo):,} registros")
        if not df_inadimplentes.empty:
            self.logger.info(f"[INADIMPLENTES] Inadimplentes: {len(df_inadimplentes):,} registros")
        if not df_baixa.empty:
            self.logger.info(f"[BAIXA] Baixa: {len(df_baixa):,} registros")

        self.logger.info("="*60)

    def extract_data(self, cedrus: bool = False) -> List[Path]:
        """Executa a extração e retorna os arquivos gerados. cedrus=True também
        grava _Inadimplentes/_Baixa no Dropbox (entrada do Cedrus)."""
        try:
            self.logger.info("[INICIO] Iniciando extração...")

            arquivo_origem = self.config.ARQUIVO_ORIGEM
            if not arquivo_origem.exists():
                raise ExcelExtractorError(f"Arquivo não encontrado: {arquivo_origem}")

            self.logger.info(f"[ARQUIVO] Arquivo origem: {arquivo_origem}")

            decrypted_file = self._decrypt_file(arquivo_origem)
            df = self._load_excel_data(decrypted_file)
            df = self._format_cod_cliente_column(df)

            self._validate_columns(df)

            df_filtrado = self._apply_date_filter(df)
            df_filtrado = self._format_contatos(df_filtrado)

            if df_filtrado.empty:
                self.logger.warning("[AVISO] Nenhum registro no período especificado")
                return []

            df_filtrado = self._adicionar_numeracao_parcelas(df_filtrado)

            df_inadimplentes, df_baixa = self._separate_by_payment_status(df_filtrado)

            df_completo_formatado = self._format_date_columns(df_filtrado)
            df_inadimplentes_formatado = self._format_date_columns(df_inadimplentes)
            df_baixa_formatado = self._format_date_columns(df_baixa)

            df_completo_formatado = self._format_cpf_cnpj_column(df_completo_formatado)
            df_inadimplentes_formatado = self._format_cpf_cnpj_column(df_inadimplentes_formatado)
            df_baixa_formatado = self._format_cpf_cnpj_column(df_baixa_formatado)

            output_dir = self._ensure_directory(self.config.PASTA_DESTINO)
            output_dir_completo = self._ensure_directory(self.config.PASTA_POWERBI)
            arquivos_gerados = []

            self.logger.info(f"[PASTA] Pasta destino (Inadimpl./Baixa): {output_dir}")
            self.logger.info(f"[REDE] Pasta destino (Completo): {output_dir_completo}")

            if not df_completo_formatado.empty:
                file_path = output_dir_completo / self.config.ARQUIVO_COMPLETO
                self.logger.info(f"[SALVANDO] Arquivo completo: {file_path}")
                df_powerbi = self._padronizar_colunas_powerbi(df_completo_formatado)
                self._save_dataframe(df_powerbi, file_path, self.config.NOME_ABA)
                arquivos_gerados.append(file_path)

            if cedrus and not df_inadimplentes_formatado.empty:
                file_path = output_dir / self.config.ARQUIVO_INADIMPLENTES
                self._save_dataframe(df_inadimplentes_formatado, file_path, self.config.NOME_ABA)
                arquivos_gerados.append(file_path)

            if cedrus and not df_baixa_formatado.empty:
                file_path = output_dir / self.config.ARQUIVO_BAIXA
                self._save_dataframe(df_baixa_formatado, file_path, self.config.NOME_ABA)
                arquivos_gerados.append(file_path)

            self._log_summary(df_completo_formatado, df_inadimplentes_formatado,
                            df_baixa_formatado, output_dir, output_dir_completo)

            self.logger.info("[SUCESSO] Extração concluída com sucesso!")
            return arquivos_gerados

        except ExcelExtractorError as e:
            self.logger.error(f"[ERRO] Erro na extração: {e}")
            return []
        except KeyboardInterrupt:
            self.logger.info("[PARADO] Operação cancelada pelo usuário")
            return []
        except Exception as e:
            self.logger.error(f"[ERRO] Erro inesperado: {e}")
            return []


def main():
    print("[EXTRATOR] CONTAS A RECEBER FOCCO -> POWER BI")
    print("="*60)

    extractor = ExcelExtractor()
    arquivos_gerados = extractor.extract_data(cedrus="--cedrus" in sys.argv[1:])

    if arquivos_gerados:
        print("\n[RESULTADOS] ARQUIVOS GERADOS:")
        print("="*50)
        for i, arquivo in enumerate(arquivos_gerados, 1):
            if "Inadimplentes" in arquivo.name:
                tipo = "INADIMPLENTES"
            elif "Baixa" in arquivo.name:
                tipo = "BAIXA"
            else:
                tipo = "COMPLETO"

            print(f"{i}. {tipo}: {arquivo.name}")
            print(f"   [LOCAL] Local: {arquivo.parent}")

        print("\n[SUCESSO] Processamento concluído!")
    else:
        print("[ERRO] Falha no processamento. Verifique os logs.")
        raise SystemExit(1)  # código de saída != 0: o Agendador de Tarefas registra a falha


if __name__ == "__main__":
    main()
