"""Configuração do Orion HQ.

Regra do projeto (tech.md): **toda configuração vem de variáveis de ambiente
lidas dentro de funções**, nunca no import. Assim os testes podem mexer no
ambiente com `monkeypatch.setenv` sem precisar reimportar o módulo, e o import
nunca falha por faltar uma variável.

Constantes determinísticas (fuso, ids dos agentes, nomes de dia/mês em PT-BR)
podem ficar no módulo, pois não dependem do ambiente.
"""

from __future__ import annotations

import os
from datetime import datetime
from zoneinfo import ZoneInfo

# Fuso do projeto (America/Sao_Paulo). Determinístico, não é config de ambiente.
TZ = ZoneInfo("America/Sao_Paulo")

# Ids dos agentes — devem ser idênticos aos do front (lib/agents.ts).
AGENTES: tuple[str, ...] = ("orq", "tech", "agenda", "negocios", "work")

# Nomes em português para montar datas (não usar %A/%B, que saem em inglês).
# Em datetime.weekday(): segunda=0 ... domingo=6.
_DIAS_SEMANA = (
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
    "domingo",
)

# Índice 0 fica vazio para acessar por número do mês (1..12).
_MESES = (
    "",
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
)


# --- Variáveis de ambiente (sempre lidas dentro de funções) ---


def database_url() -> str:
    """URL do Postgres (Neon). Vazio se não definida."""
    return os.environ.get("DATABASE_URL", "")


def anthropic_api_key() -> str:
    """Chave da API da Anthropic."""
    return os.environ.get("ANTHROPIC_API_KEY", "")


def orion_model() -> str:
    """Modelo principal (orquestrador/especialistas)."""
    return os.environ.get("ORION_MODEL", "claude-sonnet-5")


def worker_model() -> str:
    """Modelo worker (tarefas curtas/baratas)."""
    return os.environ.get("ORION_WORKER_MODEL", "claude-haiku-4-5")


def usuarios() -> dict[str, str]:
    """Usuários no formato `ORION_USERS=usuario:senha,usuario2:senha2`.

    Retorna um dict {usuario: senha}. Entradas malformadas são ignoradas.
    Dict vazio se a variável não estiver definida.
    """
    bruto = os.environ.get("ORION_USERS", "")
    resultado: dict[str, str] = {}
    for par in bruto.split(","):
        par = par.strip()
        if not par or ":" not in par:
            continue
        usuario, senha = par.split(":", 1)
        usuario = usuario.strip()
        if usuario:
            resultado[usuario] = senha
    return resultado


def aprovadores() -> set[str]:
    """Usuários que podem aprovar ações sensíveis (`ORION_APPROVERS`).

    Formato: `dimi,jullyana`. Retorna um set (vazio se não definida).
    """
    bruto = os.environ.get("ORION_APPROVERS", "")
    return {nome.strip() for nome in bruto.split(",") if nome.strip()}


def session_secret() -> str:
    """Segredo para assinar o cookie de sessão (HMAC)."""
    return os.environ.get("ORION_SESSION_SECRET", "")


def github_token() -> str:
    """Token só-leitura do repositório do Orion."""
    return os.environ.get("GITHUB_TOKEN", "")


def github_webhook_secret() -> str:
    """Segredo do webhook do GitHub (valida X-Hub-Signature-256)."""
    return os.environ.get("GITHUB_WEBHOOK_SECRET", "")


def cron_secret() -> str:
    """Segredo que a Vercel envia como Bearer nas chamadas de cron."""
    return os.environ.get("CRON_SECRET", "")


def base_url() -> str:
    """URL pública do Orion HQ, sem barra no fim (para links absolutos).

    `ORION_BASE_URL` tem prioridade; senão usa `VERCEL_PROJECT_PRODUCTION_URL`
    (definida pela Vercel, sem o protocolo). Vazio se nenhuma existir.
    """
    explicita = os.environ.get("ORION_BASE_URL", "").strip()
    if explicita:
        return explicita.rstrip("/")
    vercel = os.environ.get("VERCEL_PROJECT_PRODUCTION_URL", "").strip()
    if vercel:
        return f"https://{vercel}".rstrip("/")
    return ""


# --- Data e hora em PT-BR ---


def ler_iso(texto: object) -> datetime:
    """Converte um texto ISO 8601 em datetime. Lança ValueError se inválido.

    Aceita o sufixo `Z` (UTC), que o `fromisoformat` do Python 3.10 rejeita.
    """
    texto = str(texto).strip()
    if texto[-1:] in ("Z", "z"):
        texto = texto[:-1] + "+00:00"
    return datetime.fromisoformat(texto)


def agora() -> datetime:
    """Datetime atual no fuso de São Paulo (com tzinfo)."""
    return datetime.now(TZ)


def agora_formatado() -> str:
    """Data e hora atual em português do Brasil.

    Exemplo: "sexta-feira, 26 de setembro de 2026, 14:02".
    Monta os nomes de dia e mês manualmente para não cair no inglês do
    strftime (`%A`/`%B` dependem do locale do sistema).
    """
    momento = agora()
    dia_semana = _DIAS_SEMANA[momento.weekday()]
    mes = _MESES[momento.month]
    return (
        f"{dia_semana}, {momento.day} de {mes} de {momento.year}, "
        f"{momento:%H:%M}"
    )
