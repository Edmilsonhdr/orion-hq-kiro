"""Testes da leitura do GitHub e do Sentry para o Vigia (task 3 / Reqs 3.4, 3.10).

Cobrem, SEM tocar no GitHub nem no Sentry de verdade (via `httpx.MockTransport`):

- `commits_recentes`: parseia a resposta da API (sha curto, primeira linha da
  mensagem, autor, data) e monta os cabeçalhos com o token; sem repo/token → [].
- `ler_arquivo_repo`: recusa `.env*` e chaves ANTES de chamar a rede; trunca em
  40.000 caracteres com aviso; lê um arquivo normal (base64 → texto);
  arquivo inexistente → erro legível.
- `ultimo_evento_stack`: aplica a MESMA whitelist de `sentry.py` (só arquivo,
  função, linha, módulo; nunca `vars`) e funciona sem token (devolve []).

Estes testes NÃO dependem do Postgres: só substituem o cliente httpx.
"""

import base64

import httpx
import pytest

from _orion import github_leitura


def _instalar_transporte(monkeypatch, base_url_esperada, handler):
    """Faz `github_leitura._cliente` devolver um Client com MockTransport.

    Guarda os cabeçalhos e a base_url usados, para os testes verificarem que o
    token/Accept corretos foram enviados. `handler(request)` devolve a
    `httpx.Response` simulada.
    """
    capturado = {}

    def _fake_cliente(base_url, cabecalhos, timeout):
        capturado["base_url"] = base_url
        capturado["cabecalhos"] = cabecalhos
        capturado["timeout"] = timeout
        return httpx.Client(
            base_url=base_url,
            headers=cabecalhos,
            timeout=timeout,
            transport=httpx.MockTransport(handler),
        )

    monkeypatch.setattr(github_leitura, "_cliente", _fake_cliente)
    return capturado


@pytest.fixture(autouse=True)
def _repo_e_token(monkeypatch):
    """Configura repo e token para as leituras do GitHub."""
    monkeypatch.setenv("ORION_GITHUB_REPO", "orion/orion-app")
    monkeypatch.setenv("GITHUB_TOKEN", "token-leitura")
    # Sentry desligado por padrão; testes específicos ligam.
    monkeypatch.delenv("SENTRY_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("SENTRY_ORG", raising=False)


# --- commits_recentes ---


def test_commits_recentes_parseia_resposta(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/repos/orion/orion-app/commits"
        assert request.url.params["since"]  # foi calculado
        return httpx.Response(
            200,
            json=[
                {
                    "sha": "abcdef1234567890",
                    "commit": {
                        "message": "Corrige login\n\nDetalhes no corpo",
                        "author": {"name": "Dimi", "date": "2026-01-10T12:00:00Z"},
                    },
                },
                {
                    "sha": "0987654321fedcba",
                    "commit": {
                        "message": "Ajusta layout",
                        "author": {"name": "Jullyana", "date": "2026-01-09T09:30:00Z"},
                    },
                },
            ],
        )

    capturado = _instalar_transporte(monkeypatch, github_leitura.API_GITHUB, handler)

    commits = github_leitura.commits_recentes(7)

    assert commits == [
        {"sha": "abcdef1", "mensagem": "Corrige login", "autor": "Dimi",
         "data": "2026-01-10T12:00:00Z"},
        {"sha": "0987654", "mensagem": "Ajusta layout", "autor": "Jullyana",
         "data": "2026-01-09T09:30:00Z"},
    ]
    # O token só-leitura foi enviado.
    assert capturado["cabecalhos"]["Authorization"] == "Bearer token-leitura"
    assert capturado["timeout"] == github_leitura.TIMEOUT_GITHUB


def test_commits_recentes_sem_repo_devolve_vazio(monkeypatch):
    monkeypatch.delenv("ORION_GITHUB_REPO", raising=False)
    # Não deve nem tentar criar cliente.
    monkeypatch.setattr(
        github_leitura, "_cliente",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("não deveria chamar a rede")),
    )
    assert github_leitura.commits_recentes(7) == []


def test_commits_recentes_erro_de_rede_devolve_vazio(monkeypatch):
    def handler(request):
        raise httpx.ConnectError("sem rede")

    _instalar_transporte(monkeypatch, github_leitura.API_GITHUB, handler)
    assert github_leitura.commits_recentes(7) == []


# --- ler_arquivo_repo: recusa de segredos ---


@pytest.mark.parametrize(
    "caminho",
    [
        ".env",
        ".env.production",
        "config/.env.local",
        "deploy/prod.pem",
        "keys/server.key",
        "home/id_rsa",
        "app/aws_credentials",
        "secrets.json",
    ],
)
def test_ler_arquivo_repo_recusa_segredos(monkeypatch, caminho):
    # Se chamar a rede, falha o teste: a recusa é ANTES de qualquer request.
    monkeypatch.setattr(
        github_leitura, "_cliente",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("não deveria chamar a rede")),
    )
    assert github_leitura.ler_arquivo_repo(caminho) == github_leitura.MOTIVO_RECUSA


# --- ler_arquivo_repo: leitura normal ---


def test_ler_arquivo_repo_le_arquivo_normal(monkeypatch):
    conteudo = "export function soma(a, b) {\n  return a + b;\n}\n"
    codificado = base64.b64encode(conteudo.encode("utf-8")).decode("ascii")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/repos/orion/orion-app/contents/src/soma.ts"
        assert request.url.params["ref"] == "main"
        return httpx.Response(200, json={"encoding": "base64", "content": codificado})

    capturado = _instalar_transporte(monkeypatch, github_leitura.API_GITHUB, handler)

    resultado = github_leitura.ler_arquivo_repo("src/soma.ts", ref="main")
    assert resultado == conteudo
    assert capturado["cabecalhos"]["Authorization"] == "Bearer token-leitura"


def test_ler_arquivo_repo_trunca_em_40k(monkeypatch):
    grande = "x" * 45_000
    codificado = base64.b64encode(grande.encode("utf-8")).decode("ascii")

    def handler(request):
        return httpx.Response(200, json={"encoding": "base64", "content": codificado})

    _instalar_transporte(monkeypatch, github_leitura.API_GITHUB, handler)

    resultado = github_leitura.ler_arquivo_repo("src/grande.ts")
    assert resultado.endswith(github_leitura.AVISO_TRUNCADO)
    corpo = resultado[: -len(github_leitura.AVISO_TRUNCADO)]
    assert len(corpo) == github_leitura.LIMITE_ARQUIVO


def test_ler_arquivo_repo_inexistente_devolve_erro(monkeypatch):
    def handler(request):
        return httpx.Response(404, json={"message": "Not Found"})

    _instalar_transporte(monkeypatch, github_leitura.API_GITHUB, handler)

    resultado = github_leitura.ler_arquivo_repo("src/nao_existe.ts")
    assert "não encontrado" in resultado


# --- ultimo_evento_stack ---


def test_ultimo_evento_stack_aplica_whitelist(monkeypatch):
    monkeypatch.setenv("SENTRY_AUTH_TOKEN", "tok-sentry")
    monkeypatch.setenv("SENTRY_ORG", "orion")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/0/issues/999/events/latest/"
        assert request.headers["Authorization"] == "Bearer tok-sentry"
        return httpx.Response(
            200,
            json={
                "exception": {
                    "values": [
                        {
                            "stacktrace": {
                                "frames": [
                                    {
                                        "filename": "src/login.ts",
                                        "function": "logar",
                                        "lineno": 42,
                                        "module": "login",
                                        "in_app": True,
                                        # PII que NUNCA pode sair:
                                        "vars": {"email": "a@b.com", "senha": "123"},
                                        "context_line": "const x = senha",
                                    }
                                ]
                            }
                        }
                    ]
                }
            },
        )

    capturado = _instalar_transporte(monkeypatch, github_leitura.API_SENTRY, handler)

    frames = github_leitura.ultimo_evento_stack("999")
    assert frames == [
        {"arquivo": "src/login.ts", "funcao": "logar", "linha": 42, "modulo": "login"}
    ]
    # Nenhum campo de PII vazou.
    assert "vars" not in frames[0]
    assert "context_line" not in frames[0]
    assert capturado["timeout"] == github_leitura.TIMEOUT_SENTRY


def test_ultimo_evento_stack_sem_token_devolve_vazio(monkeypatch):
    # Sem SENTRY_AUTH_TOKEN/SENTRY_ORG: nem tenta a rede.
    monkeypatch.setattr(
        github_leitura, "_cliente",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("não deveria chamar a rede")),
    )
    assert github_leitura.ultimo_evento_stack("999") == []


def test_ultimo_evento_stack_erro_de_rede_devolve_vazio(monkeypatch):
    monkeypatch.setenv("SENTRY_AUTH_TOKEN", "tok-sentry")
    monkeypatch.setenv("SENTRY_ORG", "orion")

    def handler(request):
        raise httpx.ConnectError("sem rede")

    _instalar_transporte(monkeypatch, github_leitura.API_SENTRY, handler)
    assert github_leitura.ultimo_evento_stack("999") == []
