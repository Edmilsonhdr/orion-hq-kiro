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
import re
from datetime import datetime
from typing import Optional
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


def github_token(dono: Optional[str] = None) -> str:
    """Token só-leitura do GitHub para os repositórios de `dono`.

    Um token fine-grained só enxerga repositórios de um dono (perfil ou
    organização). Por isso, com `dono`, usa `GITHUB_TOKEN_<DONO>` se existir
    (maiúsculas, com o que não for letra/número trocado por `_`; ex.: dono
    `minha-org` → `GITHUB_TOKEN_MINHA_ORG`). Senão, usa `GITHUB_TOKEN`.
    """
    if dono:
        chave = "GITHUB_TOKEN_" + re.sub(r"[^A-Z0-9]", "_", dono.upper())
        especifico = os.environ.get(chave, "")
        if especifico:
            return especifico
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


# --- Vigia / Sentry (detecção e diagnóstico de erros de produção) ---

# Padrão de áreas protegidas: se o culpado ou um arquivo suspeito casar com um
# destes globs, o diagnóstico nunca marca `corrigivel_automaticamente=True`.
_AREAS_PROIBIDAS_PADRAO = (
    "**/migrations/**",
    "**/prisma/**",
    "**/*auth*/**",
    "**/*auth*.*",
    "**/*revenuecat*",
    "**/*payment*",
    "**/*pagamento*",
    "**/*saude*/**",
    "**/*health*/**",
)


def sentry_client_secret() -> str:
    """Segredo da integração interna do Sentry (valida Sentry-Hook-Signature)."""
    return os.environ.get("SENTRY_CLIENT_SECRET", "")


def sentry_auth_token() -> str:
    """Token de API do Sentry (opcional: busca stack do último evento)."""
    return os.environ.get("SENTRY_AUTH_TOKEN", "")


def sentry_org() -> str:
    """Slug da organização no Sentry (opcional, usado com o auth token)."""
    return os.environ.get("SENTRY_ORG", "")


def sentry_projetos() -> dict[str, str]:
    """Mapeia slug do projeto no Sentry para `app`/`backend`.

    Formato: `ORION_SENTRY_PROJETOS=orion-app:app,orion-api:backend`.
    Retorna um dict {slug: area}. Entradas malformadas são ignoradas.
    Dict vazio se a variável não estiver definida.
    """
    bruto = os.environ.get("ORION_SENTRY_PROJETOS", "")
    resultado: dict[str, str] = {}
    for par in bruto.split(","):
        par = par.strip()
        if not par or ":" not in par:
            continue
        slug, area = par.split(":", 1)
        slug = slug.strip()
        area = area.strip()
        if slug and area:
            resultado[slug] = area
    return resultado


def github_repo() -> str:
    """Repositório do app Orion no formato `owner/orion`. Vazio se não definido."""
    return os.environ.get("ORION_GITHUB_REPO", "")


def areas_proibidas() -> tuple[str, ...]:
    """Globs de áreas protegidas (`ORION_AREAS_PROIBIDAS`, separados por vírgula).

    Vazio ou ausente → padrão do design (`_AREAS_PROIBIDAS_PADRAO`).
    """
    bruto = os.environ.get("ORION_AREAS_PROIBIDAS", "").strip()
    if not bruto:
        return _AREAS_PROIBIDAS_PADRAO
    padroes = tuple(p.strip() for p in bruto.split(",") if p.strip())
    return padroes or _AREAS_PROIBIDAS_PADRAO


def max_diagnosticos_hora() -> int:
    """Máximo de diagnósticos numa janela móvel de 60 min (padrão 5).

    Valor inválido ou não positivo cai no padrão 5.
    """
    bruto = os.environ.get("ORION_MAX_DIAGNOSTICOS_HORA", "").strip()
    try:
        valor = int(bruto)
    except ValueError:
        return 5
    return valor if valor > 0 else 5


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
