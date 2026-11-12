import time
import shutil
import logging
import sys
from pathlib import Path
from datetime import datetime, date
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
from selenium.webdriver.support.ui import WebDriverWait
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

ID_LOJA = "PKKWkj"

# Destino final na pasta de rede.
# A subpasta do ano (ex: 2026) e criada automaticamente.
DESTINO_FINAL = Path(r"\\ciclone\Power BI - FoccoBrasil\Oticas Luana\DRE")


# ============================================================================
# HELPERS DE DATA E NOMENCLATURA
# ============================================================================

def calcular_periodo() -> Tuple[str, str]:
    """
    Retorna (inicio_periodo, fim_periodo) no formato DD/MM/AAAA.

    - inicio_periodo: 01/01 do ano corrente
    - fim_periodo:    ultimo dia do mes anterior
    """
    hoje = datetime.now()
    mes_anterior = hoje - relativedelta(months=1)

    inicio = date(mes_anterior.year, 1, 1)

    # Ultimo dia do mes anterior: primeiro dia do mes atual menos 1 dia
    fim = date(hoje.year, hoje.month, 1) - relativedelta(days=1)

    return inicio.strftime("%d/%m/%Y"), fim.strftime("%d/%m/%Y")


def calcular_mes_anterior() -> Tuple[int, int]:
    """Retorna (mes, ano) do mes anterior a data atual."""
    hoje = datetime.now()
    mes_anterior = hoje - relativedelta(months=1)
    return mes_anterior.month, mes_anterior.year


def montar_nome_arquivo() -> str:
    """
    Monta o nome do arquivo com o ano do mes anterior.
    Exemplo: rodando em janeiro/2027 -> ano 2026 (fecha o ano anterior)
    """
    _, ano = calcular_mes_anterior()
    return f"BD_VENDA_{ano}_LOJA INDEPENDENCIA.xlsx"


def montar_pasta_destino() -> Path:
    """
    Monta o caminho completo da pasta de destino incluindo o ano.
    Exemplo: ...\\DRE\\2026
    """
    _, ano = calcular_mes_anterior()
    return DESTINO_FINAL / str(ano)


# ============================================================================
# CONFIGURACAO DO SCRAPER
# ============================================================================

@dataclass
class Config:
    DEFAULT_TIMEOUT: int = 120
    BASE_URL: str = "https://app.ssotica.com.br"
    REPORT_URL: str = f"{BASE_URL}/relatorios/{ID_LOJA}/vendas/outro-periodo"
    SCRIPT_DIR: Path = Path(__file__).parent.resolve()
    TEMP_DIR: Path = Path(__file__).parent.resolve() / "Temporario"
    MAX_RETRIES: int = 10
    RETRY_DELAY: int = 2


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
            except Exception as e:
                self.logger.warning(f"Tentativa {attempt + 1} de preenchimento falhou: {e}")
                if attempt == self.config.MAX_RETRIES - 1:
                    raise SeleniumAutomationError("Nao foi possivel preencher campo") from e
                time.sleep(self.config.RETRY_DELAY)

    def set_date_field(self, name: str, value: str) -> None:
        """
        Preenche um campo de data pelo atributo 'name' via JavaScript,
        garantindo que o valor seja aceito mesmo em inputs com mascara.
        """
        for attempt in range(self.config.MAX_RETRIES):
            try:
                script = """
                    var el = document.querySelector('input[name="' + arguments[0] + '"]');
                    var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype, 'value').set;
                    nativeInputValueSetter.call(el, arguments[1]);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                """
                self.driver.execute_script(script, name, value)
                self.logger.info(f"Data preenchida via JS: {name} = {value}")
                return
            except Exception as e:
                self.logger.warning(f"Tentativa {attempt + 1} de set_date_field falhou: {e}")
                if attempt == self.config.MAX_RETRIES - 1:
                    raise SeleniumAutomationError(f"Nao foi possivel preencher data: {name}") from e
                time.sleep(self.config.RETRY_DELAY)

    def wait_for_download(self, timeout: Optional[int] = None) -> str:
        """Aguarda download concluir e retorna o caminho do arquivo."""
        timeout = timeout or self.config.DEFAULT_TIMEOUT
        if self.download_start_time is None:
            self.download_start_time = time.time()

        start_time = time.time()
        last_size = -1
        stable_time = 0
        check_interval = 0.5
        stability_threshold = 2

        while (time.time() - start_time) < timeout:
            try:
                files = [
                    f for f in self.config.TEMP_DIR.iterdir()
                    if (
                        f.is_file()
                        and not f.name.startswith(".")
                        and f.stat().st_ctime >= self.download_start_time
                    )
                ]
                complete_files = [f for f in files if not f.name.endswith(".crdownload")]

                if complete_files:
                    newest = max(complete_files, key=lambda x: x.stat().st_ctime)
                    current_size = newest.stat().st_size
                    if current_size == last_size and current_size > 0:
                        stable_time += check_interval
                        if stable_time >= stability_threshold:
                            self.logger.info(f"Download concluido: {newest}")
                            return str(newest)
                    else:
                        stable_time = 0
                        last_size = current_size
            except Exception as e:
                self.logger.warning(f"Erro ao verificar downloads: {e}")
            time.sleep(check_interval)

        raise TimeoutError(f"Download nao concluido apos {timeout} segundos.")


# ============================================================================
# SCRAPER PRINCIPAL
# ============================================================================

class ReportScraper:
    """Scraper para relatorio de Vendas - periodo do ano ate fim do mes anterior."""

    def __init__(self, config: Config):
        self.config = config
        self.logger = self._setup_logging()
        self.driver: Optional[WebDriver] = None
        self.helper: Optional[SeleniumHelper] = None

    def _setup_logging(self) -> logging.Logger:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s - %(levelname)s - %(message)s",
            handlers=[
                logging.StreamHandler(),
                logging.FileHandler(self.config.SCRIPT_DIR / "scraper.log"),
            ],
        )
        return logging.getLogger(__name__)

    def _setup_chrome_options(self, download_dir: Path) -> Options:
        download_dir.mkdir(parents=True, exist_ok=True)
        options = Options()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-gpu")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--start-maximized")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument("--log-level=1")
        options.add_argument("--disable-popup-blocking")
        options.add_argument("--disable-extensions")
        prefs = {
            "download.default_directory": str(download_dir),
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True,
            "profile.default_content_settings.popups": 0,
        }
        options.add_experimental_option("prefs", prefs)
        return options

    @contextmanager
    def _get_driver(self, download_dir: Optional[Path] = None):
        if download_dir is None:
            download_dir = self.config.TEMP_DIR
        try:
            options = self._setup_chrome_options(download_dir)
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

    def aplicar_filtro_e_exportar(self) -> str:
        """
        Acessa o relatorio de vendas por periodo, preenche as datas
        (01/01/ano_atual ate ultimo dia do mes anterior) e clica em Aplicar.
        Em seguida aguarda os dados carregarem e clica em Exportar.
        """
        inicio_periodo, fim_periodo = calcular_periodo()
        self.logger.info(
            f"Acessando relatorio de vendas: {self.config.REPORT_URL}\n"
            f"  Periodo: {inicio_periodo} a {fim_periodo}"
        )

        self.driver.get(self.config.REPORT_URL)
        time.sleep(3)

        # ---------- Preenche as datas ----------
        # Os campos usam mascara de data; preenchemos via JavaScript para garantir
        # que o valor seja aceito independentemente do datepicker.
        self.helper.set_date_field("filterForm[inicioPeriodo]", inicio_periodo)
        time.sleep(0.5)
        self.helper.set_date_field("filterForm[fimPeriodo]", fim_periodo)
        time.sleep(0.5)

        # ---------- Clica em Aplicar ----------
        aplicar_selector = (By.CSS_SELECTOR, "#formFilterOutroPeriodo .btnSearch")
        self.logger.info("Clicando em Aplicar")
        self.helper.click_element(aplicar_selector)

        # ---------- Aguarda dados carregarem ----------
        try:
            self.helper.wait.until(
                EC.invisibility_of_element_located(
                    (By.XPATH, '//*[contains(text(), "Aguarde, preparando dados ...")]')
                )
            )
            self.logger.info("Dados carregados")
        except TimeoutException:
            self.logger.warning("Timeout aguardando dados - prosseguindo")

        time.sleep(3)

        # ---------- Abre dropdown Exportar e escolhe "Vendas incluindo itens" ----------
        # O botao Exportar e um dropdown; e preciso abri-lo antes de clicar na opcao.
        exportar_btn_selector = (By.ID, "btnExportar")
        self.logger.info("Abrindo dropdown Exportar")
        self.helper.click_element(exportar_btn_selector)
        time.sleep(0.5)

        # Clica na opcao "Vendas incluindo itens"
        exportar_itens_selector = (
            By.XPATH,
            '//a[contains(@href, "/vendas/todas/exportar") and contains(@href, "incluir_itens_exportacao=1")]',
        )
        self.logger.info("Clicando em 'Vendas incluindo itens'")
        self.helper.download_start_time = time.time()
        self.helper.click_element(exportar_itens_selector)

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

        mes, ano = calcular_mes_anterior()
        inicio_periodo, fim_periodo = calcular_periodo()
        self.logger.info(
            f"Referencia: {mes:02d}/{ano}  ->  {caminho_final}\n"
            f"Periodo consultado: {inicio_periodo} a {fim_periodo}"
        )

        with self._get_driver(self.config.TEMP_DIR):
            try:
                self.login(credentials)
                downloaded_file = self.aplicar_filtro_e_exportar()

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
    print("EXCELLENCE OTICAS - VENDAS (ANO ATE MES ANTERIOR)")
    print("=" * 60)

    mes, ano = calcular_mes_anterior()
    inicio_periodo, fim_periodo = calcular_periodo()
    nome_arquivo = montar_nome_arquivo()
    pasta_destino = montar_pasta_destino()

    print(f"Mes de referencia : {mes:02d}/{ano}")
    print(f"Periodo consultado: {inicio_periodo} a {fim_periodo}")
    print(f"Nome do arquivo   : {nome_arquivo}")
    print(f"Destino           : {pasta_destino}")
    print(f"Caminho raiz      : {ROOT_DIR}")
    print("=" * 60)
    print()

    try:
        config = Config()
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
