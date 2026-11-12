import time
import shutil
import logging
import sys
from pathlib import Path
from datetime import datetime
from dateutil.relativedelta import relativedelta
from typing import Optional, Tuple
from dataclasses import dataclass
from contextlib import contextmanager

# ============================================================================
# CAMINHO RAIZ - sobe dois niveis: 2_Excellence_DRE -> Script_DRE -> Codigo_Oticas
# Funciona em qualquer computador desde que a estrutura de pastas seja a mesma.
# ============================================================================
ROOT_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT_DIR))

from credentials import Credentials

import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    WebDriverException,
    TimeoutException,
    StaleElementReferenceException,
    ElementClickInterceptedException,
)
from webdriver_manager.chrome import ChromeDriverManager


# ============================================================================
# CONFIGURACAO GLOBAL
# Altere apenas estas variaveis se necessario.
# ============================================================================

# Destino final na pasta de rede.
# A subpasta do ano (ex: 2026) e criada automaticamente.
DESTINO_FINAL = Path(r"\\ciclone\Power BI - FoccoBrasil\Oticas Luana\DRE")


# ============================================================================
# HELPERS DE DATA E NOMENCLATURA
# ============================================================================

def obter_ano_referencia() -> int:
    """
    Retorna o ano do mes anterior a data atual (mesma regra de Vendas e Produtos).
    Exemplo: rodando em janeiro/2027 -> 2026, para fechar o DRE do ano anterior.
    """
    return (datetime.now() - relativedelta(months=1)).year


def montar_nome_arquivo() -> str:
    """
    Monta o nome do arquivo no formato BD_DRE_Loja Eusebio_AAAA.xlsx.
    Exemplo: rodando em 2026 -> 'BD_DRE_Loja Eusebio_2026.xlsx'
    """
    ano = obter_ano_referencia()
    return f"BD_DRE_Quiterianopolis_{ano}.xlsx"


def montar_pasta_destino() -> Path:
    """
    Monta o caminho completo da pasta de destino incluindo o ano.
    Exemplo: ...\\DRE\\2026
    """
    ano = obter_ano_referencia()
    return DESTINO_FINAL / str(ano)


# ============================================================================
# CONFIGURACAO DO SCRAPER
# ============================================================================

@dataclass
class Config:
    DEFAULT_TIMEOUT: int = 120
    BASE_URL: str = "https://app.ssotica.com.br"
    REPORT_URL: str = f"{BASE_URL}/financeiro/resultado"
    SCRIPT_DIR: Path = Path(__file__).parent.resolve()
    TEMP_DIR: Path = Path(__file__).parent.resolve() / "Temporario"
    MAX_RETRIES: int = 10
    RETRY_DELAY: int = 2
    EMPRESA_NOME: str = "Oticas Luana - Quiterionopolis"  # Nome exato da loja no sistema


# ============================================================================
# EXCECAO CUSTOMIZADA
# ============================================================================

class SeleniumAutomationError(Exception):
    """Excecao para erros de automacao."""
    pass


# ============================================================================
# HELPER SELENIUM
# ============================================================================

class SeleniumHelper:
    """Operacoes Selenium com retry automatico."""

    def __init__(self, driver: WebDriver, config: Config):
        self.driver = driver
        self.config = config
        self.wait = WebDriverWait(driver, config.DEFAULT_TIMEOUT)
        self.download_start_time: Optional[float] = None
        self.logger = logging.getLogger(__name__)

    def find_element(self, selector: Tuple, timeout: Optional[int] = None):
        timeout = timeout or self.config.DEFAULT_TIMEOUT
        for attempt in range(self.config.MAX_RETRIES):
            try:
                element = WebDriverWait(self.driver, timeout).until(
                    EC.presence_of_element_located(selector)
                )
                self.logger.info(f"Elemento encontrado: {selector}")
                return element
            except TimeoutException as e:
                self.logger.warning(f"Tentativa {attempt + 1} falhou ao localizar: {selector}")
                if attempt == self.config.MAX_RETRIES - 1:
                    raise SeleniumAutomationError(
                        f"Elemento nao encontrado apos {self.config.MAX_RETRIES} tentativas: {selector}"
                    ) from e
                time.sleep(self.config.RETRY_DELAY)

    def click_element(self, selector: Tuple, timeout: Optional[int] = None, use_js: bool = False) -> None:
        timeout = timeout or self.config.DEFAULT_TIMEOUT
        for attempt in range(self.config.MAX_RETRIES):
            try:
                self.logger.info(f"Clicando: {selector} (tentativa {attempt + 1})")
                element = WebDriverWait(self.driver, timeout).until(
                    EC.element_to_be_clickable(selector)
                )
                self.driver.execute_script(
                    "arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", element
                )
                time.sleep(1)
                if use_js or attempt >= 1:
                    self.driver.execute_script("arguments[0].click();", element)
                else:
                    element.click()
                self.logger.info(f"Clique bem-sucedido na tentativa {attempt + 1}")
                return

            except ElementClickInterceptedException:
                self.logger.warning(f"Elemento interceptado - tentando JavaScript")
                try:
                    element = WebDriverWait(self.driver, 5).until(
                        EC.presence_of_element_located(selector)
                    )
                    self.driver.execute_script("arguments[0].click();", element)
                    return
                except Exception as js_err:
                    self.logger.warning(f"JavaScript click falhou: {js_err}")

            except (StaleElementReferenceException, TimeoutException, WebDriverException) as e:
                self.logger.warning(f"Tentativa {attempt + 1} falhou: {type(e).__name__}")

            if attempt == self.config.MAX_RETRIES - 1:
                raise SeleniumAutomationError(
                    f"Nao foi possivel clicar apos {self.config.MAX_RETRIES} tentativas: {selector}"
                )
            time.sleep(self.config.RETRY_DELAY)

    def fill_field(self, selector: Tuple, text: str) -> None:
        element = self.find_element(selector)
        for attempt in range(self.config.MAX_RETRIES):
            try:
                element.clear()
                element.send_keys(text)
                self.logger.info(f"Campo preenchido: {selector}")  # nao registra o texto (pode ser senha)
                return
            except (StaleElementReferenceException, WebDriverException) as e:
                self.logger.warning(f"Tentativa {attempt + 1} de preenchimento falhou: {e}")
                if attempt == self.config.MAX_RETRIES - 1:
                    raise SeleniumAutomationError(
                        f"Nao foi possivel preencher apos {self.config.MAX_RETRIES} tentativas: {selector}"
                    ) from e
                element = self.find_element(selector)
                time.sleep(self.config.RETRY_DELAY)

    def wait_for_download(self, timeout: int = 120) -> str:
        """Aguarda o download ser concluido e retorna o caminho do arquivo."""
        self.logger.info("Aguardando download...")
        start = time.time()
        temp_dir = self.config.TEMP_DIR

        while time.time() - start < timeout:
            files = list(temp_dir.glob("*"))
            # Ignora arquivos temporarios do Chrome (.crdownload, .tmp)
            complete = [f for f in files if not f.name.endswith((".crdownload", ".tmp"))]

            if complete:
                # Aguarda o arquivo estabilizar (tamanho nao muda)
                file = complete[0]
                size1 = file.stat().st_size
                time.sleep(2)
                size2 = file.stat().st_size
                if size1 == size2 and size1 > 0:
                    elapsed = time.time() - (self.download_start_time or start)
                    self.logger.info(f"Download concluido em {elapsed:.1f}s: {file.name}")
                    return str(file)

            time.sleep(1)

        raise SeleniumAutomationError(f"Download nao foi concluido em {timeout}s")


# ============================================================================
# SCRAPER PRINCIPAL
# ============================================================================

class ReportScraper:
    def __init__(self, config: Config):
        self.config = config
        self.driver: Optional[WebDriver] = None
        self.helper: Optional[SeleniumHelper] = None
        self.logger = self._setup_logger()

    def _setup_logger(self) -> logging.Logger:
        logger = logging.getLogger(__name__)
        if not logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
            logger.addHandler(handler)
            logger.setLevel(logging.INFO)
        return logger

    @contextmanager
    def _get_driver(self, download_dir: Path):
        try:
            options = Options()
            options.add_argument("--start-maximized")
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_experimental_option("excludeSwitches", ["enable-automation"])
            options.add_experimental_option("useAutomationExtension", False)

            prefs = {
                "download.default_directory": str(download_dir.resolve()),
                "download.prompt_for_download": False,
                "download.directory_upgrade": True,
                "safebrowsing.enabled": False,
            }
            options.add_experimental_option("prefs", prefs)

            service = Service(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=options)
            self.driver.set_page_load_timeout(self.config.DEFAULT_TIMEOUT)
            self.driver.implicitly_wait(5)
            self.helper = SeleniumHelper(self.driver, self.config)
            yield self.driver
        finally:
            if self.driver:
                self.logger.info("Encerrando navegador")
                self.driver.quit()

    def login(self, credentials: Credentials) -> None:
        self.logger.info("Iniciando login")
        for attempt in range(self.config.MAX_RETRIES):
            try:
                self.driver.get(self.config.BASE_URL)
                self.helper.fill_field((By.ID, "email"), credentials.email)
                self.helper.fill_field((By.ID, "senha"), credentials.password)
                self.helper.click_element((By.XPATH, '//button[contains(text(), "ENTRAR")]'))
                self.helper.wait.until(EC.url_changes(self.config.BASE_URL))
                self.logger.info("Login realizado com sucesso")
                return
            except Exception as e:
                self.logger.warning(f"Tentativa {attempt + 1} de login falhou: {e}")
                if attempt == self.config.MAX_RETRIES - 1:
                    raise SeleniumAutomationError("Falha ao realizar login") from e
                time.sleep(self.config.RETRY_DELAY)

    def _is_csv(self, path: Path) -> bool:
        """Verifica se o arquivo baixado e CSV (nao XLSX)."""
        try:
            with open(path, "rb") as f:
                amostra = f.read(512)
            return not amostra.startswith(b"PK")
        except Exception:
            return False

    def _converter_para_xlsx(self, origem: Path, destino: Path) -> None:
        """Converte CSV para XLSX ou copia XLSX direto."""
        if origem.suffix.lower() in (".csv", ".txt") or self._is_csv(origem):
            self.logger.info(f"Convertendo CSV -> XLSX: {origem.name}")
            for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
                try:
                    df = pd.read_csv(origem, encoding=enc, sep=",", dtype=str)
                    df.to_excel(destino, index=False, engine="openpyxl")
                    self.logger.info(f"Conversao concluida (encoding: {enc})")
                    return
                except UnicodeDecodeError:
                    continue
            raise SeleniumAutomationError(f"Nao foi possivel decodificar o CSV: {origem}")
        else:
            shutil.copy2(str(origem), str(destino))

    def selecionar_empresa(self) -> None:
        """
        Seleciona a empresa no dropdown bootstrap-select pelo nome configurado em Config.EMPRESA_NOME.
        Estrategia:
          1. Abre o dropdown clicando no botao (data-id='empresasField')
          2. Aguarda os itens ficarem visiveis
          3. Clica via JS no <span class="text"> cujo texto corresponde ao nome da loja
          4. Aguarda a pagina recarregar apos a troca de filial
        """
        nome_alvo = self.config.EMPRESA_NOME
        self.logger.info(f"Selecionando empresa: {nome_alvo}")

        # 1. Abre o dropdown clicando no botao
        btn_selector = (By.CSS_SELECTOR, "button[data-id='empresasField']")
        self.helper.click_element(btn_selector)
        time.sleep(1)

        # 2. Localiza todos os itens e clica no correto
        try:
            items = WebDriverWait(self.driver, self.config.DEFAULT_TIMEOUT).until(
                EC.presence_of_all_elements_located(
                    (By.CSS_SELECTOR, "ul.dropdown-menu.inner li a span.text")
                )
            )

            for item in items:
                if item.text.strip() == nome_alvo:
                    self.driver.execute_script("arguments[0].click();", item)
                    self.logger.info(f"Empresa clicada: {nome_alvo}")
                    break
            else:
                raise SeleniumAutomationError(
                    f"Empresa '{nome_alvo}' nao encontrada no dropdown. "
                    f"Opcoes disponiveis: {[i.text.strip() for i in items]}"
                )

        except TimeoutException as e:
            raise SeleniumAutomationError(
                "Dropdown de empresas nao abriu ou itens nao ficaram visiveis"
            ) from e

        # 3. Aguarda a pagina recarregar apos a troca de filial
        time.sleep(3)
        WebDriverWait(self.driver, self.config.DEFAULT_TIMEOUT).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )
        self.logger.info("Empresa selecionada e pagina recarregada com sucesso")

    def acessar_dre_e_exportar(self) -> str:
        ano_ref = obter_ano_referencia()
        self.logger.info(
            f"Acessando pagina de DRE: {self.config.REPORT_URL}\n"
            f"  Empresa : {self.config.EMPRESA_NOME}\n"
            f"  Ano     : {ano_ref}"
        )

        self.driver.get(self.config.REPORT_URL)
        time.sleep(3)

        # ---------- 1. Seleciona a empresa ----------
        self.selecionar_empresa()
        # selecionar_empresa() já aguarda o readyState == complete

        # ---------- 2. Garante que o tipo de período seja "Ano" ----------
        # O radio "Ano" pode já vir checked, mas após reload da empresa precisamos confirmar.
        try:
            self.logger.info("Selecionando tipo de periodo: Ano")
            self.helper.click_element((By.ID, "tipoPeriodoAno"), use_js=True)
            time.sleep(1)
        except Exception as e:
            self.logger.warning(f"Nao foi possivel clicar no radio 'Ano': {e}")

        # ---------- 3. Preenche o ano no yearpicker ----------
        # O campo tem id="yearpicker" e name="filterForm[year]".
        # É um datepicker Bootstrap — precisamos:
        #   a) Limpar e enviar o valor
        #   b) Disparar 'change' via JS para atualizar o hidden #data_ANO
        try:
            ano_selector = (By.CSS_SELECTOR, "input#yearpicker")
            ano_element = self.helper.find_element(ano_selector, timeout=15)

            self.driver.execute_script(
                """
                arguments[0].value = arguments[1];
                arguments[0].dispatchEvent(new Event('change', {bubbles: true}));
                arguments[0].dispatchEvent(new Event('input',  {bubbles: true}));
                """,
                ano_element,
                str(ano_ref),
            )
            # Atualiza também o hidden guard usado pelo datepicker
            self.driver.execute_script(
                "var h = document.querySelector('#data_ANO'); if(h) h.value = arguments[0];",
                f"01/01/{ano_ref}",
            )
            self.logger.info(f"Ano preenchido via JS: {ano_ref}")

        except Exception as e:
            self.logger.warning(
                f"Nao foi possivel preencher o ano explicitamente: {e}\n"
                "Assumindo que o ano atual ja esta selecionado por padrao"
            )

        time.sleep(1)

        # ---------- 4. Clica em Exportar ----------
        exportar_selector = (By.CSS_SELECTOR, "a[href*='/financeiro/resultado/exportar']")
        self.logger.info("Clicando em Exportar")
        self.helper.download_start_time = time.time()
        self.helper.click_element(exportar_selector)

        downloaded_file = self.helper.wait_for_download(timeout=120)
        self.logger.info(f"Arquivo baixado: {downloaded_file}")
        return downloaded_file

    def run(self, credentials: Optional[Credentials] = None) -> str:
        if credentials is None:
            credentials = Credentials.from_env()

        self.config.TEMP_DIR.mkdir(parents=True, exist_ok=True)

        nome_arquivo = montar_nome_arquivo()
        pasta_destino = montar_pasta_destino()
        caminho_final = pasta_destino / nome_arquivo

        ano = obter_ano_referencia()
        self.logger.info(
            f"Ano de referencia : {ano}\n"
            f"Empresa           : {self.config.EMPRESA_NOME}\n"
            f"Destino           : {caminho_final}"
        )

        with self._get_driver(self.config.TEMP_DIR):
            try:
                self.login(credentials)
                downloaded_file = self.acessar_dre_e_exportar()

                # Garante que a pasta de destino existe
                pasta_destino.mkdir(parents=True, exist_ok=True)

                # Remove arquivo existente se houver
                if caminho_final.exists():
                    caminho_final.unlink()
                    self.logger.info(f"Arquivo anterior removido: {caminho_final}")

                # Salva no destino final
                self._converter_para_xlsx(Path(downloaded_file), caminho_final)

                if caminho_final.exists() and caminho_final.stat().st_size > 0:
                    self.logger.info(f"Relatorio salvo: {caminho_final}")
                    return str(caminho_final)
                else:
                    raise SeleniumAutomationError("Arquivo final nao foi criado ou esta vazio")

            except Exception as e:
                self.logger.error(f"Erro durante execucao: {e}")
                raise
            finally:
                if self.config.TEMP_DIR.exists():
                    shutil.rmtree(self.config.TEMP_DIR)
                    self.logger.info("Diretorio temporario limpo")


# ============================================================================
# ENTRY POINT
# ============================================================================

def main():
    print("=" * 60)
    print("EXCELLENCE OTICAS - DRE FINANCEIRO (ANO DO MES ANTERIOR)")
    print("=" * 60)

    config = Config()
    ano = obter_ano_referencia()
    nome_arquivo = montar_nome_arquivo()
    pasta_destino = montar_pasta_destino()

    print(f"Empresa           : {config.EMPRESA_NOME}")
    print(f"Ano de referencia : {ano}")
    print(f"Nome do arquivo   : {nome_arquivo}")
    print(f"Destino           : {pasta_destino}")
    print(f"Caminho raiz      : {ROOT_DIR}")
    print("=" * 60)
    print()

    try:
        scraper = ReportScraper(config)
        resultado = scraper.run()
        print(f"\nProcesso concluido com sucesso!")
        print(f"Arquivo salvo em: {resultado}")
        return 0
    except Exception as e:
        print(f"\nErro durante execucao: {e}")
        return 1


if __name__ == "__main__":
    exit(main())
