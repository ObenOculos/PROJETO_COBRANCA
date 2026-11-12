import time
import shutil
import logging
import sys
import os
from pathlib import Path
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
from typing import List, Optional, Tuple
from dataclasses import dataclass
from contextlib import contextmanager

# ============================================================================
# CAMINHO RAIZ - sobe dois niveis: 1_Excellence_DRE -> Script_DRE -> Codigo_Oticas
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

ID_LOJA = "PbllBO"

# Destino final na pasta de rede.
# A subpasta do ano (ex: 2026) e "Produtos\Excellence Oticas" sao criadas automaticamente.
DESTINO_FINAL = Path(r"\\ciclone\Power BI - FoccoBrasil\Oticas Luana\DRE")


# ============================================================================
# HELPERS DE DATA E NOMENCLATURA
# ============================================================================

def calcular_mes_anterior() -> Tuple[int, int]:
    """Retorna (mes, ano) do mes anterior a data atual."""
    hoje = datetime.now()
    mes_anterior = hoje - relativedelta(months=1)
    return mes_anterior.month, mes_anterior.year


def meses_referencia() -> List[Tuple[int, int]]:
    """
    Retorna a lista de (mes, ano) a exportar.
    Se a variavel de ambiente DRE_MESES_REF estiver definida
    (ex: '2026-01,2026-02'), usa esses meses; caso contrario, so o mes anterior.
    """
    ref = os.environ.get("DRE_MESES_REF")
    if not ref:
        return [calcular_mes_anterior()]
    meses = []
    for item in ref.split(","):
        ano, mes = (int(p) for p in item.strip().split("-"))
        meses.append((mes, ano))
    return meses


def calcular_periodo_mes(mes: int, ano: int) -> Tuple[str, str]:
    """Retorna (primeiro_dia, ultimo_dia) do mes no formato DD/MM/AAAA."""
    inicio = date(ano, mes, 1)
    fim = inicio + relativedelta(months=1) - relativedelta(days=1)
    return inicio.strftime("%d/%m/%Y"), fim.strftime("%d/%m/%Y")


def montar_nome_arquivo(mes: int, ano: int) -> str:
    """
    Monta o nome do arquivo no formato MM.AAAA.xlsx.
    Exemplo: abril/2026 -> '04.2026.xlsx'
    """
    return f"{mes:02d}.{ano}.xlsx"


def montar_pasta_destino(ano: int) -> Path:
    """
    Monta o caminho completo da pasta de destino incluindo o ano.
    Exemplo: ...\\DRE\\2026\\Produtos\\Oticas Luana Itapipoca
    """
    return DESTINO_FINAL / str(ano) / "Produtos" / "Oticas Luana Itapipoca"


# ============================================================================
# CONFIGURACAO DO SCRAPER
# ============================================================================

@dataclass
class Config:
    DEFAULT_TIMEOUT: int = 120
    BASE_URL: str = "https://app.ssotica.com.br"
    REPORT_URL: str = f"{BASE_URL}/relatorios/{ID_LOJA}/produtos-vendidos/mes-anterior"
    REPORT_URL_PERIODO: str = f"{BASE_URL}/relatorios/{ID_LOJA}/produtos-vendidos/outro-periodo"
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


class LojaBloqueadaError(SeleniumAutomationError):
    """O SSOtica negou acesso ao relatorio (ex.: licenca suspensa por falta de pagamento)."""
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
    """Scraper para relatorio de Produtos Vendidos - mes anterior."""

    def __init__(self, config: Config):
        self.config = config
        self.logger = self._setup_logging()
        self.driver: Optional[WebDriver] = None
        self.helper: Optional[SeleniumHelper] = None
        self.bloqueada = False

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

    def verificar_acesso(self) -> None:
        """
        Levanta LojaBloqueadaError se o SSOtica nao abriu o relatorio: quando a
        licenca da loja esta suspensa, a pagina redireciona para o Painel e mostra
        'Acesso Negado - Voce nao tem permissao para [Produtos Vendidos em Relatorios]'.
        """
        self.driver.implicitly_wait(0)
        try:
            negado = self.driver.find_elements(By.XPATH, '//*[contains(text(), "Acesso Negado")]')
        finally:
            self.driver.implicitly_wait(5)
        # Exige o codigo da propria loja na URL: o SSOtica pode redirecionar uma loja
        # bloqueada para a pagina de outra loja ja visitada na mesma sessao
        if f"/relatorios/{ID_LOJA}/produtos-vendidos" not in self.driver.current_url or negado:
            raise LojaBloqueadaError(
                f"Sem acesso ao relatorio de produtos (licenca suspensa ou sem permissao). "
                f"URL atual: {self.driver.current_url}"
            )

    def exportar_relatorio(self, mes: int, ano: int, por_periodo: bool) -> Optional[str]:
        """
        Exporta o relatorio de produtos vendidos de um mes.
        por_periodo=False usa a aba 'mes anterior' (execucao normal);
        por_periodo=True usa a aba 'outro periodo', trocando as datas para o mes informado.
        Retorna None se o sistema informar que nao ha produtos vendidos no periodo.
        """
        if por_periodo:
            inicio_periodo, fim_periodo = calcular_periodo_mes(mes, ano)
            self.logger.info(
                f"Acessando: {self.config.REPORT_URL_PERIODO}\n"
                f"  Periodo: {inicio_periodo} a {fim_periodo}"
            )
            self.driver.get(self.config.REPORT_URL_PERIODO)
            time.sleep(3)
            self.verificar_acesso()

            self.helper.set_date_field("filterForm[inicioPeriodo]", inicio_periodo)
            time.sleep(0.5)
            self.helper.set_date_field("filterForm[fimPeriodo]", fim_periodo)
            time.sleep(0.5)

            # Aplicar faz POST e recarrega a pagina; guarda a pagina atual para
            # garantir que o resultado lido depois ja e do novo periodo
            pagina_antiga = self.driver.find_element(By.TAG_NAME, "html")
            self.logger.info("Clicando em Aplicar")
            self.helper.click_element((By.CSS_SELECTOR, "#formFilterOutroPeriodo .btnSearch"))
            try:
                self.helper.wait.until(EC.staleness_of(pagina_antiga))
                self.logger.info("Pagina recarregada com o novo periodo")
            except TimeoutException:
                self.logger.warning("Pagina nao recarregou apos Aplicar - prosseguindo")
            time.sleep(3)
        else:
            self.logger.info(f"Acessando: {self.config.REPORT_URL}")
            self.driver.get(self.config.REPORT_URL)
            time.sleep(5)
            self.verificar_acesso()

        # Aguarda desaparecer mensagem de carregamento
        try:
            self.helper.wait.until(
                EC.invisibility_of_element_located(
                    (By.XPATH, '//*[contains(text(), "Aguarde, preparando dados ...")]')
                )
            )
            self.logger.info("Dados carregados")
        except TimeoutException:
            self.logger.warning("Timeout aguardando dados - prosseguindo")

        # Aguarda aparecer o botao Exportar ou o aviso de periodo sem vendas
        export_selector = (By.XPATH, '//a[contains(@href, "/produtos-vendidos/exportar")]')
        sem_dados_selector = (
            By.XPATH,
            '//*[contains(text(), "Não foi encontrado nenhum produto vendido")]',
        )
        try:
            self.helper.wait.until(
                EC.any_of(
                    EC.presence_of_element_located(export_selector),
                    EC.presence_of_element_located(sem_dados_selector),
                )
            )
        except TimeoutException:
            self.logger.warning("Timeout aguardando botao Exportar - prosseguindo")

        if self.driver.find_elements(*sem_dados_selector):
            self.logger.warning(f"Nenhum produto vendido em {mes:02d}/{ano} - nada para exportar")
            return None

        # Clica no botao Exportar
        self.logger.info("Clicando em Exportar")
        self.helper.download_start_time = time.time()
        self.helper.click_element(export_selector)

        downloaded_file = self.helper.wait_for_download(timeout=120)
        self.logger.info(f"Arquivo baixado: {downloaded_file}")
        return downloaded_file

    def salvar_relatorio(self, downloaded_file: str, mes: int, ano: int) -> str:
        """Salva o arquivo baixado como MM.AAAA.xlsx na pasta de destino do ano."""
        pasta_destino = montar_pasta_destino(ano)
        caminho_final = pasta_destino / montar_nome_arquivo(mes, ano)

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
        raise SeleniumAutomationError("Arquivo final nao foi criado ou esta vazio")

    def run(self, credentials: Optional[Credentials] = None) -> List[str]:
        """
        Faz login uma unica vez e exporta cada mes de meses_referencia()
        na mesma sessao. Retorna a lista de arquivos salvos.
        """
        if credentials is None:
            credentials = Credentials.from_env()

        self.config.TEMP_DIR.mkdir(parents=True, exist_ok=True)

        meses = meses_referencia()
        por_periodo = bool(os.environ.get("DRE_MESES_REF"))
        self.logger.info(
            "Referencia: " + ", ".join(f"{m:02d}/{a}" for m, a in meses)
        )

        salvos: List[str] = []
        sem_dados: List[str] = []
        falhas: List[str] = []

        with self._get_driver(self.config.TEMP_DIR):
            try:
                self.login(credentials)

                for mes, ano in meses:
                    try:
                        downloaded_file = self.exportar_relatorio(mes, ano, por_periodo)
                        if downloaded_file is None:
                            sem_dados.append(f"{mes:02d}/{ano}")
                            continue
                        salvos.append(self.salvar_relatorio(downloaded_file, mes, ano))
                    except LojaBloqueadaError as e:
                        # Nao adianta tentar os outros meses: a loja inteira esta sem acesso
                        self.logger.warning(f"Loja ignorada: {e}")
                        self.bloqueada = True
                        return salvos
                    except Exception as e:
                        self.logger.error(f"Erro no mes {mes:02d}/{ano}: {e}")
                        falhas.append(f"{mes:02d}/{ano}")

                if sem_dados:
                    self.logger.info(f"Meses sem produtos vendidos (sem arquivo): {', '.join(sem_dados)}")
                if falhas:
                    raise SeleniumAutomationError(f"Falha nos meses: {', '.join(falhas)}")
                return salvos

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
    print("EXCELLENCE OTICAS - PRODUTOS VENDIDOS")
    print("=" * 60)

    meses = meses_referencia()

    print(f"Mes(es) de referencia: {', '.join(f'{m:02d}/{a}' for m, a in meses)}")
    print(f"Destino              : {montar_pasta_destino(meses[0][1])}")
    print(f"Caminho raiz         : {ROOT_DIR}")
    print("=" * 60)
    print()

    try:
        config = Config()
        scraper = ReportScraper(config)
        resultado = scraper.run()
        if scraper.bloqueada:
            print("\nLOJA IGNORADA: sem acesso ao relatorio de produtos "
                  "(licenca suspensa ou sem permissao no SSOtica).")
            return 2
        print(f"\nProcesso concluido com sucesso!")
        for arquivo in resultado:
            print(f"Arquivo salvo em: {arquivo}")
        if not resultado:
            print("Nenhum produto vendido no(s) mes(es) informado(s) - nenhum arquivo gerado.")
        return 0
    except Exception as e:
        print(f"\nErro durante execucao: {e}")
        return 1


if __name__ == "__main__":
    exit(main())
