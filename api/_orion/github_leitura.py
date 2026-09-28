"""Leitura só-leitura do GitHub e do Sentry para o diagnóstico do Vigia.

Este módulo é a camada de leitura que o Rui (e o Tobias, a mando do Rui) usam
para investigar um erro de produção (design.md, "Diagnóstico"). Tudo aqui é
somente leitura: nunca escreve nada no GitHub nem no Sentry.

Funções expostas:

- `commits_recentes(dias)` — commits recentes do repositório `ORION_GITHUB_REPO`
  (sha curto, mensagem, autor e data), para o Rui cruzar a primeira ocorrência
  do erro com o que mudou por perto (Requirement 3.4).
- `ler_arquivo_repo(caminho, ref=None)` — lê um arquivo do repo pela Contents
  API. RECUSA `.env*`, chaves e segredos, e TRUNCA em 40.000 caracteres com um
  aviso (Requirements 3.4, 3.10).
- `ultimo_evento_stack(sentry_issue_id)` — busca OPCIONAL do último evento de
  uma issue no Sentry para obter o stack trace, aplicando a MESMA whitelist de
  `sentry.py`. Sem `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`, segue sem stack
  (Requirement 3.10).

Convenções (tech.md): env lida DENTRO das funções; a chamada HTTP fica isolada
num cliente próprio para os testes a substituírem via `httpx.MockTransport`,
sem tocar no GitHub nem no Sentry; import tardio de httpx; compatível com
Python 3.10 e 3.12.
"""

from __future__ import annotations

import base64
import fnmatch
import logging
import posixpath
from datetime import timedelta
from typing import Any, Optional

from . import config, sentry

logger = logging.getLogger("orion.github_leitura")

# Timeout das chamadas ao GitHub (mesmo do webhook, design.md).
TIMEOUT_GITHUB = 15.0

# Timeout da busca do último evento no Sentry (design.md, "Stack trace").
TIMEOUT_SENTRY = 10.0

# Base da API pública do GitHub.
API_GITHUB = "https://api.github.com"

# Base da API pública do Sentry (sentry.io na nuvem).
API_SENTRY = "https://sentry.io"

# Teto de caracteres de um arquivo lido do repo (Requirement 3.4).
LIMITE_ARQUIVO = 40_000

# Aviso anexado quando o conteúdo é cortado no limite.
AVISO_TRUNCADO = "\n… (arquivo truncado em 40.000 caracteres)"

# Nº máximo de commits pedidos numa listagem (evita respostas gigantes).
MAX_COMMITS = 100

# Padrões de caminho que NUNCA podem ser lidos: arquivos de ambiente, chaves
# privadas e credenciais. O casamento é feito no nome do arquivo e no caminho
# inteiro, sem diferenciar maiúsculas (Requirement 3.4).
PADROES_PROIBIDOS = (
    ".env",
    ".env.*",
    "*.env",
    "*.pem",
    "*.key",
    "*.pfx",
    "*.p12",
    "*.keystore",
    "id_rsa",
    "id_rsa.*",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    "*.crt",
    "*credential*",
    "*secret*",
    "*.pgpass",
    ".netrc",
    ".npmrc",
    ".pypirc",
)

# Texto devolvido ao modelo quando o arquivo é recusado (não é uma exceção: o
# Rui/Tobias precisa receber isso como resultado de ferramenta).
MOTIVO_RECUSA = "Recusado: arquivo com credenciais ou variáveis de ambiente."


# --- Cliente HTTP comum (isolado para os testes) ---


def _cliente(base_url: str, cabecalhos: dict, timeout: float):
    """Cria um `httpx.Client` só-leitura. Import tardio de httpx.

    Isolada para os testes injetarem um `httpx.MockTransport` via
    `monkeypatch`, sem chamar o GitHub nem o Sentry de verdade.
    """
    import httpx

    return httpx.Client(base_url=base_url, headers=cabecalhos, timeout=timeout)


def _cabecalhos_github(token: str) -> dict:
    """Cabeçalhos padrão da API do GitHub com o token só-leitura."""
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
    }


# --- Commits recentes (Requirement 3.4) ---


def _abreviar_sha(sha: Any) -> Optional[str]:
    """Devolve os 7 primeiros caracteres do sha, ou None."""
    if not sha:
        return None
    return str(sha)[:7]


def _primeira_linha(mensagem: Any) -> str:
    """Primeira linha da mensagem de commit (o assunto), sem o corpo."""
    texto = str(mensagem or "").strip()
    return texto.splitlines()[0] if texto else ""


def commits_recentes(dias: int) -> list[dict]:
    """Lista os commits dos últimos `dias` dias do repositório do Orion.

    Usa `GET /repos/{repo}/commits?since=...` com o `GITHUB_TOKEN` só-leitura
    (Requirement 3.4). Devolve uma lista de `{sha, mensagem, autor, data}`, com
    o sha curto e só a primeira linha da mensagem. Sem `ORION_GITHUB_REPO` ou
    sem token configurado, devolve lista vazia (o diagnóstico segue sem isso).

    Tolerante a falhas: erro de rede/HTTP vira log + lista vazia, para não
    derrubar o diagnóstico (o Rui apenas fica sem essa pista).
    """
    repo = config.github_repo()
    dono = repo.split("/")[0] if "/" in repo else None
    token = config.github_token(dono)
    if not repo or not token:
        return []

    desde = (config.agora() - timedelta(days=max(dias, 0))).isoformat()
    try:
        with _cliente(API_GITHUB, _cabecalhos_github(token), TIMEOUT_GITHUB) as cliente:
            resposta = cliente.get(
                f"/repos/{repo}/commits",
                params={"since": desde, "per_page": MAX_COMMITS},
            )
            resposta.raise_for_status()
            dados = resposta.json()
    except Exception as erro:  # noqa: BLE001 — leitura best-effort
        logger.warning("Falha ao listar commits de %s: %s", repo, type(erro).__name__)
        return []

    commits: list[dict] = []
    for item in dados if isinstance(dados, list) else []:
        if not isinstance(item, dict):
            continue
        commit = item.get("commit") if isinstance(item.get("commit"), dict) else {}
        autor = commit.get("author") if isinstance(commit.get("author"), dict) else {}
        commits.append(
            {
                "sha": _abreviar_sha(item.get("sha")),
                "mensagem": _primeira_linha(commit.get("message")),
                "autor": (autor.get("name") or "").strip() or None,
                "data": (autor.get("date") or "").strip() or None,
            }
        )
    return commits


# --- Leitura de arquivo do repo (Requirements 3.4, 3.10) ---


def _proibido(caminho: str) -> bool:
    """Diz se o caminho casa com um padrão de arquivo proibido.

    Compara o caminho inteiro e só o nome do arquivo (basename) contra
    `PADROES_PROIBIDOS`, sem diferenciar maiúsculas de minúsculas. Assim tanto
    `config/.env` quanto `deploy/prod.pem` são recusados (Requirement 3.4).
    """
    normalizado = caminho.strip().lstrip("/").lower()
    nome = posixpath.basename(normalizado)
    for padrao in PADROES_PROIBIDOS:
        if fnmatch.fnmatch(nome, padrao) or fnmatch.fnmatch(normalizado, padrao):
            return True
    return False


def _decodificar_conteudo(dados: dict) -> Optional[str]:
    """Decodifica o conteúdo base64 da Contents API para texto.

    A Contents API devolve `content` em base64 (com quebras de linha) quando
    `encoding == "base64"`. Decodifica em UTF-8, ignorando bytes inválidos
    (arquivos binários viram texto degradado, mas não quebram o diagnóstico).
    Se o formato não for o esperado, devolve None.
    """
    if dados.get("encoding") != "base64":
        return None
    bruto = dados.get("content")
    if not isinstance(bruto, str):
        return None
    try:
        return base64.b64decode(bruto).decode("utf-8", errors="replace")
    except (ValueError, TypeError):
        return None


def ler_arquivo_repo(caminho: str, ref: Optional[str] = None) -> str:
    """Lê um arquivo do repositório do Orion pela Contents API do GitHub.

    Recebe o `caminho` relativo ao repo e um `ref` opcional (branch, tag ou
    sha). Devolve o conteúdo como texto. Regras (Requirements 3.4, 3.10):

    - RECUSA arquivos de ambiente, chaves e segredos (`PADROES_PROIBIDOS`),
      devolvendo `MOTIVO_RECUSA` sem sequer chamar o GitHub.
    - TRUNCA em 40.000 caracteres, anexando `AVISO_TRUNCADO`.
    - Sem `ORION_GITHUB_REPO`/token, ou em erro de rede/HTTP, devolve um texto
      de erro para o modelo (nunca lança), para o diagnóstico seguir com o que
      houver.
    """
    caminho = (caminho or "").strip()
    if not caminho:
        return "Erro: caminho vazio."
    if _proibido(caminho):
        return MOTIVO_RECUSA

    repo = config.github_repo()
    dono = repo.split("/")[0] if "/" in repo else None
    token = config.github_token(dono)
    if not repo or not token:
        return "Erro: repositório do Orion não configurado."

    params = {"ref": ref} if ref else None
    try:
        with _cliente(API_GITHUB, _cabecalhos_github(token), TIMEOUT_GITHUB) as cliente:
            resposta = cliente.get(
                f"/repos/{repo}/contents/{caminho.lstrip('/')}",
                params=params,
            )
            if resposta.status_code == 404:
                return f"Erro: arquivo não encontrado: {caminho}"
            resposta.raise_for_status()
            dados = resposta.json()
    except Exception as erro:  # noqa: BLE001 — leitura best-effort
        logger.warning("Falha ao ler %s de %s: %s", caminho, repo, type(erro).__name__)
        return f"Erro ao ler {caminho}: {type(erro).__name__}"

    if not isinstance(dados, dict):
        return f"Erro: {caminho} não é um arquivo (talvez um diretório)."

    conteudo = _decodificar_conteudo(dados)
    if conteudo is None:
        return f"Erro: não foi possível ler o conteúdo de {caminho}."

    if len(conteudo) > LIMITE_ARQUIVO:
        return conteudo[:LIMITE_ARQUIVO] + AVISO_TRUNCADO
    return conteudo


# --- Stack trace do último evento no Sentry (Requirement 3.10) ---


def ultimo_evento_stack(sentry_issue_id: Optional[str]) -> list[dict]:
    """Busca o stack trace do último evento de uma issue no Sentry (opcional).

    O payload de `issue.created` costuma não trazer frames; quando
    `SENTRY_AUTH_TOKEN` e `SENTRY_ORG` estão configurados, buscamos o último
    evento (`GET /api/0/issues/{id}/events/latest/`, timeout 10 s) e aplicamos a
    MESMA whitelist de `sentry.py` (`sentry._extrair_frames`) — nunca vaza PII.

    Sem token/org, sem issue id, ou em erro de rede/HTTP, devolve `[]`: o
    diagnóstico segue sem stack, com confiança baixa (Requirement 3.10).
    """
    token = config.sentry_auth_token()
    org = config.sentry_org()
    if not sentry_issue_id or not token or not org:
        return []

    cabecalhos = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    try:
        with _cliente(API_SENTRY, cabecalhos, TIMEOUT_SENTRY) as cliente:
            resposta = cliente.get(f"/api/0/issues/{sentry_issue_id}/events/latest/")
            resposta.raise_for_status()
            evento = resposta.json()
    except Exception as erro:  # noqa: BLE001 — busca best-effort
        logger.warning(
            "Falha ao buscar último evento da issue %s: %s",
            sentry_issue_id,
            type(erro).__name__,
        )
        return []

    if not isinstance(evento, dict):
        return []

    # A whitelist de frames vive em sentry.py e lê `exception.values[].stacktrace`.
    exception = evento.get("exception")
    if not isinstance(exception, dict):
        return []
    return sentry._extrair_frames(exception)
