"""Login da SSÓtica para os scripts da DRE (scripts/ssotica/dre/<loja>/*.py
fazem `from credentials import Credentials` a partir desta pasta).

Lê SSO_EMAIL / SSO_PASSWORD das variáveis de ambiente ou do .env do
repositório (fora do git) -- o mesmo usado pelos outros scripts da SSÓtica
(cancelados_ssotica.credenciais_ssotica). Substitui o credentials.py da pasta
antiga Empresa_Oben/.../SSÓTICA/Código_Óticas (2026-11-12).
"""
from dataclasses import dataclass

from cancelados_ssotica import credenciais_ssotica


@dataclass
class Credentials:
    email: str
    password: str

    @classmethod
    def from_env(cls) -> "Credentials":
        email, senha = credenciais_ssotica()
        return cls(email=email, password=senha)
