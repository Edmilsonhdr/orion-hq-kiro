"""Testes das rotas de autenticação (`/api/login`, `/api/logout`, `/api/me`).

Cobrem os Requirements 1.1, 1.2, 1.3 e 1.5. Usam `TestClient` sobre o `app`
do FastAPI e não precisam de banco (nenhum uso da fixture `banco`). As
credenciais e o segredo de sessão são injetados por `monkeypatch.setenv`.
"""

import importlib

import pytest
from fastapi.testclient import TestClient

# Env de teste usado em todos os casos.
_SEGREDO = "segredo-de-teste-bem-longo-para-hmac"
_USUARIOS = "dimi:senha-dimi,jullyana:senha-jully"
_APROVADORES = "dimi,jullyana"


@pytest.fixture()
def cliente(monkeypatch):
    """Cliente HTTP de teste com o ambiente de auth configurado.

    Como `config` lê o ambiente dentro das funções, basta definir as variáveis
    antes de usar o app. Reimportamos `index` para garantir que ele seja
    carregado com o `sys.path` já ajustado pelo conftest.
    """
    monkeypatch.setenv("ORION_SESSION_SECRET", _SEGREDO)
    monkeypatch.setenv("ORION_USERS", _USUARIOS)
    monkeypatch.setenv("ORION_APPROVERS", _APROVADORES)

    import index

    importlib.reload(index)
    # `base_url` em localhost faz o cookie sair sem `secure`, para que o próprio
    # TestClient (que fala HTTP) o reenvie nas requisições seguintes. Em
    # produção (host real, HTTPS) o cookie continua saindo `secure`.
    return TestClient(index.app, base_url="http://localhost")


def _tem_cookie_sessao(response) -> bool:
    """True se a resposta setou o cookie `orion_sessao` com valor não vazio."""
    from _orion import auth

    for chave, valor in response.cookies.items():
        if chave == auth.NOME_COOKIE and valor:
            return True
    return False


def test_login_com_credenciais_corretas_grava_cookie(cliente):
    # Requirement 1.1: login válido cria a sessão por cookie.
    resposta = cliente.post(
        "/api/login", json={"usuario": "dimi", "senha": "senha-dimi"}
    )

    assert resposta.status_code == 200
    assert resposta.json() == {"usuario": "dimi"}
    # O cookie de sessão deve estar presente na resposta.
    assert "orion_sessao" in resposta.headers.get("set-cookie", "")
    assert _tem_cookie_sessao(resposta)


def test_login_com_senha_errada_da_401_sem_cookie(cliente):
    # Requirement 1.2: senha errada → 401, sem cookie e sem revelar o campo.
    resposta = cliente.post(
        "/api/login", json={"usuario": "dimi", "senha": "errada"}
    )

    assert resposta.status_code == 401
    assert not _tem_cookie_sessao(resposta)
    detalhe = resposta.json()["detail"].lower()
    # Mensagem genérica: não pode apontar que foi "senha" nem "usuário".
    assert "senha" not in detalhe or "usuário" in detalhe
    assert detalhe == "usuário ou senha inválidos."


def test_login_com_usuario_inexistente_da_401(cliente):
    # Requirement 1.2: usuário desconhecido → mesma resposta genérica de 401.
    resposta = cliente.post(
        "/api/login", json={"usuario": "ninguem", "senha": "seja-la-o-que-for"}
    )

    assert resposta.status_code == 401
    assert not _tem_cookie_sessao(resposta)
    assert resposta.json()["detail"] == "Usuário ou senha inválidos."


def test_me_sem_cookie_da_401(cliente):
    # Requirement 1.3: rota protegida sem sessão válida → 401.
    resposta = cliente.get("/api/me")
    assert resposta.status_code == 401


def test_fluxo_login_e_me_devolve_usuario_e_aprovador(cliente):
    # Requirement 1.1 + 1.3: após login, o cookie do client autentica /api/me.
    login = cliente.post(
        "/api/login", json={"usuario": "jullyana", "senha": "senha-jully"}
    )
    assert login.status_code == 200

    # O TestClient guarda o cookie e o reenvia automaticamente.
    me = cliente.get("/api/me")
    assert me.status_code == 200
    assert me.json() == {"usuario": "jullyana", "aprovador": True}


def test_logout_limpa_cookie_e_me_volta_a_dar_401(cliente):
    # Login, logout e depois /api/me deve voltar a 401 (sessão encerrada).
    cliente.post(
        "/api/login", json={"usuario": "dimi", "senha": "senha-dimi"}
    )
    assert cliente.get("/api/me").status_code == 200

    logout = cliente.post("/api/logout")
    assert logout.status_code == 200
    assert logout.json() == {"ok": True}

    # Após o logout, o cookie foi removido e a rota protegida rejeita.
    assert cliente.get("/api/me").status_code == 401
