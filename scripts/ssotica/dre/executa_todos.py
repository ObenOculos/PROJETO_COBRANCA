"""
Script para executar todos os arquivos DRE de todas as unidades
Executa os scripts na ordem: Produtos, Resultados, Vendas para cada unidade
"""

import os
import sys
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

# Define o diretório raiz dos scripts
script_dir = Path(__file__).parent

# Lista de unidades (pastas)
unidades = [
    "1_Exellence_DRE",
    "2_Poranga_DRE",
    "3_Crateús_DRE",
    "4_Independência_DRE",
    "5_Itapipoca_DRE",
    "6_Novo_Oriente_DRE",
    "7_Crateús_Ext_DRE",
    "8_Exellence_Messejana_DRE",
    "9_Quiterianopolis_DRE"
]

# Ordem de execução dos scripts
tipos_script = ["Produtos", "Resultados", "Vendas"]

# Codigo de saida dos scripts quando a loja esta sem acesso ao relatorio
# (ex.: licenca suspensa por falta de pagamento) - nao conta como erro
CODIGO_LOJA_IGNORADA = 2
scripts_ignorados: List[str] = []

def montar_caminho_script(unidade: str, tipo: str) -> Path:
    """
    Monta o caminho do script de uma unidade/tipo baseado no padrao de nomes
    """
    prefixo_unidade = unidade.split('_')[0]

    # Trata nomes especiais de arquivos
    if "Exellence" in unidade and "Messejana" not in unidade:
        nome_arquivo = f"{prefixo_unidade}_Excellence_DRE_{tipo}.py"
    elif "Messejana" in unidade:
        nome_arquivo = f"{prefixo_unidade}_Excellence_Messejana_DRE_{tipo}.py"
    else:
        # Extrai o nome base da unidade (sem número no início)
        nome_base = unidade.replace(f"{prefixo_unidade}_", "")
        nome_arquivo = f"{prefixo_unidade}_{nome_base}_{tipo}.py"

    return script_dir / unidade / nome_arquivo


def executar_script(caminho_script: Path, env: Optional[Dict[str, str]] = None, timeout: int = 300) -> bool:
    """
    Executa um script Python e retorna o status.
    env: variaveis de ambiente extras para o script (ex: {"DRE_MESES_REF": "2026-01,2026-02"})
    timeout: tempo maximo em segundos
    """
    try:
        print(f"\n{'='*60}")
        print(f"Executando: {caminho_script.name}")
        print(f"{'='*60}")

        resultado = subprocess.run(
            [sys.executable, str(caminho_script)],
            cwd=caminho_script.parent,
            env={**os.environ, **env} if env else None,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        
        if resultado.stdout:
            print(resultado.stdout)
        
        if resultado.returncode == CODIGO_LOJA_IGNORADA:
            print(f"⏭ {caminho_script.name} ignorado: loja sem acesso (licença suspensa ou sem permissão)")
            scripts_ignorados.append(str(caminho_script))
            return True
        elif resultado.returncode != 0:
            print(f"❌ Erro ao executar {caminho_script.name}")
            if resultado.stderr:
                print(f"Erro: {resultado.stderr}")
            return False
        else:
            print(f"✓ {caminho_script.name} executado com sucesso!")
            return True
            
    except subprocess.TimeoutExpired:
        print(f"❌ Timeout ao executar {caminho_script.name} (excedeu {timeout // 60} minutos)")
        return False
    except Exception as e:
        print(f"❌ Erro ao executar {caminho_script.name}: {str(e)}")
        return False

def main():
    """
    Função principal que coordena a execução de todos os scripts
    """
    # Evita UnicodeEncodeError (─, ✓, ❌) quando a saida nao e um console UTF-8
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    print(f"\n{'='*60}")
    print("INICIANDO EXECUÇÃO DE TODOS OS SCRIPTS DRE")
    print(f"Hora: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print(f"{'='*60}\n")
    
    total_scripts = 0
    scripts_sucesso = 0
    scripts_erro = []
    
    # Executa os scripts de cada unidade
    for unidade in unidades:
        caminho_unidade = script_dir / unidade
        
        if not caminho_unidade.exists():
            print(f"⚠ Pasta não encontrada: {unidade}")
            continue
        
        print(f"\n{'─'*60}")
        print(f"Processando unidade: {unidade}")
        print(f"{'─'*60}")
        
        for tipo in tipos_script:
            caminho_script = montar_caminho_script(unidade, tipo)

            if caminho_script.exists():
                total_scripts += 1
                if executar_script(caminho_script):
                    scripts_sucesso += 1
                else:
                    scripts_erro.append(str(caminho_script))
            else:
                print(f"⚠ Arquivo não encontrado: {caminho_script.name}")
    
    # Resumo final
    print(f"\n\n{'='*60}")
    print("RESUMO DA EXECUÇÃO")
    print(f"{'='*60}")
    print(f"Total de scripts: {total_scripts}")
    print(f"Sucesso: {scripts_sucesso}")
    print(f"Erros: {len(scripts_erro)}")
    if scripts_ignorados:
        print(f"Ignorados (loja sem acesso): {len(scripts_ignorados)}")
        for ign in scripts_ignorados:
            print(f"  - {ign}")
    
    if scripts_erro:
        print(f"\n⚠ Scripts com erro:")
        for erro in scripts_erro:
            print(f"  - {erro}")
    
    print(f"\nHora de término: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print(f"{'='*60}\n")
    
    return 0 if len(scripts_erro) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
