import subprocess
import os
import time
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass
import json
import sys
import threading
import queue

@dataclass
class ScriptResult:
    """Resultado da execução de um script"""
    name: str
    path: str
    success: bool
    return_code: int
    start_time: datetime
    end_time: datetime
    output: str = ""
    error_output: str = ""
    error_message: Optional[str] = None
    
    @property
    def duration(self) -> timedelta:
        return self.end_time - self.start_time
    
    @property
    def duration_str(self) -> str:
        total_seconds = int(self.duration.total_seconds())
        minutes, seconds = divmod(total_seconds, 60)
        return f"{minutes:02d}:{seconds:02d}"


class OutputReader:
    """Leitor assíncrono de output de processos"""
    
    def __init__(self, stream, queue, prefix=""):
        self.stream = stream
        self.queue = queue
        self.prefix = prefix
        
    def run(self):
        """Lê o stream linha por linha e adiciona à fila"""
        for line in iter(self.stream.readline, ''):
            if line:
                self.queue.put((self.prefix, line.rstrip()))
        self.stream.close()


class ScriptRunner:
    """Executor automatizado de scripts Python com captura de output em tempo real"""
    
    def __init__(self, 
                 interval_seconds: int = 5,
                 log_file: str = "script_execution.log",
                 python_executable: str = sys.executable,  # mesmo Python da tarefa agendada
                 show_output: bool = True,
                 save_output: bool = True):
        self.interval_seconds = interval_seconds
        self.python_executable = python_executable
        self.show_output = show_output
        self.save_output = save_output
        self.results: List[ScriptResult] = []
        self._setup_logging(log_file)
        
    def _setup_logging(self, log_file: str) -> None:
        """Configura o sistema de logging"""
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s - %(levelname)s - %(message)s",
            handlers=[
                logging.FileHandler(log_file, encoding='utf-8'),
                logging.StreamHandler()
            ],
            force=True
        )
        
    def validate_scripts(self, script_paths: List[str]) -> Dict[str, bool]:
        """
        Valida se todos os scripts existem
        
        Returns:
            Dict com path do script e se ele existe
        """
        validation = {}
        missing_count = 0
        
        for script_path in script_paths:
            exists = os.path.exists(script_path)
            validation[script_path] = exists
            
            if not exists:
                missing_count += 1
                logging.warning(f"[X] Arquivo não encontrado: {script_path}")
            else:
                logging.info(f"[OK] Arquivo encontrado: {script_path}")
        
        if missing_count > 0:
            logging.warning(f"[!] {missing_count} arquivo(s) não encontrado(s)")
        else:
            logging.info("[OK] Todos os arquivos foram encontrados!")
            
        return validation
    
    def _process_output_queue(self, q: queue.Queue, script_name: str, 
                            output_list: List[str], error_list: List[str]) -> None:
        """Processa a fila de output do processo"""
        while True:
            try:
                prefix, line = q.get(timeout=0.1)
                
                # Salva o output nas listas apropriadas
                if prefix == "STDOUT":
                    output_list.append(line)
                    if self.show_output:
                        print(f"[{script_name}] {line}", flush=True)  # flush=True força saída imediata
                else:  # STDERR
                    error_list.append(line)
                    if self.show_output:
                        # Verifica se é realmente um erro ou apenas log informativo
                        line_lower = line.lower()
                        if any(word in line_lower for word in ['error', 'erro', 'exception', 'falha', 'failed']):
                            # É um erro real - mostra em vermelho
                            print(f"[{script_name}] [ERROR] {line}", file=sys.stderr, flush=True)
                        elif any(word in line_lower for word in ['warning', 'aviso', 'warn']):
                            # É um aviso - mostra em amarelo
                            print(f"[{script_name}] [WARNING] {line}", flush=True)
                        else:
                            # É apenas informativo vindo do stderr - mostra normal
                            print(f"[{script_name}] {line}", flush=True)
                        
            except queue.Empty:
                break
    
    def run_single_script(self, script_path: str) -> ScriptResult:
        """
        Executa um único script com captura de output em tempo real
        
        Args:
            script_path: Caminho do script
            
        Returns:
            Resultado da execução
        """
        script_name = Path(script_path).name
        start_time = datetime.now()
        
        logging.info(f"[>] Executando: {script_name}")
        if self.show_output:
            print(f"\n{'='*60}", flush=True)
            print(f"OUTPUT DE: {script_name}", flush=True)
            print(f"{'='*60}", flush=True)
        
        output_lines = []
        error_lines = []
        
        try:
            # Inicia o processo
            # Configura variáveis de ambiente para forçar saída sem buffer
            env = os.environ.copy()
            env['PYTHONUNBUFFERED'] = '1'
            
            process = subprocess.Popen(
                [self.python_executable, "-u", script_path],  # -u para unbuffered output
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,  # Redireciona stderr para stdout
                text=True,
                bufsize=1,  # Line buffered
                universal_newlines=True,
                env=env  # Passa ambiente com PYTHONUNBUFFERED
            )
            
            # Cria fila para comunicação entre threads
            output_queue = queue.Queue()
            
            # Inicia thread para ler stdout (que agora inclui stderr)
            stdout_thread = threading.Thread(
                target=OutputReader(process.stdout, output_queue, "STDOUT").run
            )
            
            stdout_thread.daemon = True
            stdout_thread.start()
            
            # Processa output enquanto o processo está rodando
            while process.poll() is None:
                self._process_output_queue(output_queue, script_name, output_lines, error_lines)
                time.sleep(0.01)
            
            # Processa qualquer output restante
            stdout_thread.join(timeout=1)
            self._process_output_queue(output_queue, script_name, output_lines, error_lines)
            
            # Pega o código de retorno
            return_code = process.wait()
            
            end_time = datetime.now()
            
            if return_code == 0:
                script_result = ScriptResult(
                    name=script_name,
                    path=script_path,
                    success=True,
                    return_code=return_code,
                    start_time=start_time,
                    end_time=end_time,
                    output="\n".join(output_lines),
                    error_output="\n".join(error_lines)
                )
                
                logging.info(f"[OK] {script_name} concluído com sucesso! "
                            f"Tempo: {script_result.duration_str}")
            else:
                script_result = ScriptResult(
                    name=script_name,
                    path=script_path,
                    success=False,
                    return_code=return_code,
                    start_time=start_time,
                    end_time=end_time,
                    output="\n".join(output_lines),
                    error_output="\n".join(error_lines),
                    error_message=f"Script retornou código {return_code}"
                )
                
                logging.error(f"[X] {script_name} falhou com código {return_code}")
                
        except subprocess.TimeoutExpired:
            process.kill()
            end_time = datetime.now()
            script_result = ScriptResult(
                name=script_name,
                path=script_path,
                success=False,
                return_code=-1,
                start_time=start_time,
                end_time=end_time,
                output="\n".join(output_lines),
                error_output="\n".join(error_lines),
                error_message="Timeout - Script demorou mais que 5 minutos"
            )
            
            logging.error(f"[!] Timeout ao executar {script_name}")
            
        except Exception as e:
            end_time = datetime.now()
            script_result = ScriptResult(
                name=script_name,
                path=script_path,
                success=False,
                return_code=-2,
                start_time=start_time,
                end_time=end_time,
                output="\n".join(output_lines),
                error_output="\n".join(error_lines),
                error_message=f"Erro inesperado: {e}"
            )
            
            logging.error(f"[!] Erro inesperado com {script_name}: {e}")
        
        if self.show_output:
            print(f"{'='*60}\n", flush=True)
            
        return script_result
    
    def run_scripts(self, script_paths: List[str], 
                   validate_first: bool = True,
                   stop_on_error: bool = False) -> List[ScriptResult]:
        """
        Executa uma lista de scripts em sequência
        
        Args:
            script_paths: Lista de caminhos dos scripts
            validate_first: Se deve validar existência dos arquivos primeiro
            stop_on_error: Se deve parar ao encontrar erro
            
        Returns:
            Lista com resultados da execução
        """
        execution_start = datetime.now()
        
        # Validação inicial
        if validate_first:
            validation = self.validate_scripts(script_paths)
            missing_scripts = [path for path, exists in validation.items() if not exists]
            
            if missing_scripts:
                logging.error("[X] Não é possível continuar - arquivos não encontrados")
                return []
        
        logging.info(f"[>] Iniciando execução de {len(script_paths)} scripts")
        logging.info(f"[>] Intervalo entre scripts: {self.interval_seconds}s")
        logging.info(f"[>] Exibição de output: {'Ativada' if self.show_output else 'Desativada'}")
        
        self.results = []
        
        for index, script_path in enumerate(script_paths):
            # Pula scripts que não existem
            if validate_first and not os.path.exists(script_path):
                continue
                
            # Executa o script
            result = self.run_single_script(script_path)
            self.results.append(result)
            
            # Para se houver erro e stop_on_error estiver ativo
            if not result.success and stop_on_error:
                logging.error("[!] Parando execução devido a erro")
                break
            
            # Intervalo antes do próximo (exceto no último)
            if index < len(script_paths) - 1:
                logging.info(f"[...] Aguardando {self.interval_seconds}s antes do próximo script...")
                time.sleep(self.interval_seconds)
        
        # Relatório final
        execution_end = datetime.now()
        total_time = execution_end - execution_start
        self._print_summary(total_time)
        
        return self.results
    
    def _print_summary(self, total_time: timedelta) -> None:
        """Imprime resumo da execução"""
        successful = sum(1 for r in self.results if r.success)
        failed = len(self.results) - successful
        
        logging.info("\n" + "="*60)
        logging.info("RESUMO DA EXECUÇÃO")
        logging.info("="*60)
        logging.info(f"Total de scripts: {len(self.results)}")
        logging.info(f"Sucessos: {successful}")
        logging.info(f"Falhas: {failed}")
        logging.info(f"Tempo total: {self._format_timedelta(total_time)}")
        logging.info("="*60)
        
        if failed > 0:
            logging.info("\nSCRIPTS COM ERRO:")
            for result in self.results:
                if not result.success:
                    logging.error(f"  - {result.name}: {result.error_message}")
        
        logging.info("\nDETALHAMENTO:")
        for i, result in enumerate(self.results, 1):
            status = "[OK]" if result.success else "[X]"
            logging.info(f"{i:2d}. {status} {result.name} - {result.duration_str}")
            
            # Mostra estatísticas de output se habilitado
            if self.save_output:
                output_lines = len(result.output.split('\n')) if result.output else 0
                error_lines = len(result.error_output.split('\n')) if result.error_output else 0
                if output_lines > 0 or error_lines > 0:
                    logging.info(f"     |-- Output: {output_lines} linhas | Erros: {error_lines} linhas")
    
    def _format_timedelta(self, td: timedelta) -> str:
        """Formata timedelta para exibição"""
        total_seconds = int(td.total_seconds())
        hours, remainder = divmod(total_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        
        if hours > 0:
            return f"{hours}h {minutes:02d}m {seconds:02d}s"
        else:
            return f"{minutes:02d}m {seconds:02d}s"
    
    def save_report(self, filename: str = None) -> None:
        """Salva relatório detalhado em JSON"""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"execution_report_{timestamp}.json"
        
        report_data = {
            "execution_time": datetime.now().isoformat(),
            "total_scripts": len(self.results),
            "successful": sum(1 for r in self.results if r.success),
            "failed": sum(1 for r in self.results if not r.success),
            "results": [
                {
                    "name": r.name,
                    "path": r.path,
                    "success": r.success,
                    "return_code": r.return_code,
                    "start_time": r.start_time.isoformat(),
                    "end_time": r.end_time.isoformat(),
                    "duration_seconds": r.duration.total_seconds(),
                    "error_message": r.error_message,
                    "output_lines": len(r.output.split('\n')) if r.output else 0,
                    "error_lines": len(r.error_output.split('\n')) if r.error_output else 0,
                    "output": r.output if self.save_output else "Output não salvo",
                    "error_output": r.error_output if self.save_output else "Error output não salvo"
                }
                for r in self.results
            ]
        }
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)
        
        logging.info(f"[>] Relatório salvo em: {filename}")
        
    def save_output_files(self, output_dir: str = "script_outputs") -> None:
        """Salva o output de cada script em arquivos separados"""
        if not self.save_output:
            logging.warning("[!] save_output está desativado - nenhum arquivo será salvo")
            return
            
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        for result in self.results:
            if result.output or result.error_output:
                base_name = Path(result.name).stem
                
                # Salva output padrão
                if result.output:
                    output_file = output_path / f"{base_name}_{timestamp}_output.txt"
                    with open(output_file, 'w', encoding='utf-8') as f:
                        f.write(f"Script: {result.name}\n")
                        f.write(f"Executado em: {result.start_time}\n")
                        f.write(f"Duração: {result.duration_str}\n")
                        f.write(f"{'='*60}\n\n")
                        f.write(result.output)
                    
                # Salva erros
                if result.error_output:
                    error_file = output_path / f"{base_name}_{timestamp}_errors.txt"
                    with open(error_file, 'w', encoding='utf-8') as f:
                        f.write(f"Script: {result.name}\n")
                        f.write(f"Executado em: {result.start_time}\n")
                        f.write(f"{'='*60}\n\n")
                        f.write(result.error_output)
        
        logging.info(f"[>] Outputs salvos em: {output_path}")


def main():
    """Função principal"""
    # Diretório base: sempre a pasta onde este script está salvo.
    # Isso garante que o Agendador de Tarefas encontre os arquivos
    # independentemente do diretório de trabalho configurado na tarefa.
    BASE_DIR = Path(__file__).resolve().parent

    # Força output sem buffer de forma compatível
    import sys
    try:
        # Tenta o método mais moderno primeiro
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(line_buffering=True)
    except:
        # Fallback para versões antigas
        if hasattr(sys.stdout, 'flush'):
            # Força flush após cada print
            sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', 1)

    scripts = [
        str(BASE_DIR / "BD_DRE_FoccoBrasil.py"),
        str(BASE_DIR / "BD_MULTASJUROS_FoccoBrasil.py"),
        str(BASE_DIR / "BonusPerca_FoccoBrasil.py"),
        str(BASE_DIR / "Relatório - Vendas_DRE_FoccoBrasil.py"),
    ]

    # Logs e relatórios em scripts/focco/saida (fora do git).
    SAIDA = BASE_DIR.parent / "saida"
    SAIDA.mkdir(parents=True, exist_ok=True)
    log_file = str(SAIDA / "dre_focco.log")

    runner = ScriptRunner(
        interval_seconds=5,
        log_file=log_file,
        show_output=True,  # Mostra output em tempo real
        save_output=True   # Salva output no relatório
    )
    

    logging.info("[>] Iniciando automação dos scripts das óticas...")
    results = runner.run_scripts(
        scripts, 
        validate_first=True,
        stop_on_error=False   
    )
    

    runner.save_report(str(SAIDA / f"dre_focco_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"))
    
    # Opcionalmente, salva outputs em arquivos separados
    runner.save_output_files(str(SAIDA / "dre_focco_outputs"))
    
    logging.info("[>] Automação finalizada!")
    # Falha em qualquer script = código de erro (o Agendador mostra "falhou").
    return 1 if any(not r.success for r in runner.results) else 0


if __name__ == "__main__":
    # Define variável de ambiente para Python sem buffer
    os.environ['PYTHONUNBUFFERED'] = '1'
    sys.exit(main())
