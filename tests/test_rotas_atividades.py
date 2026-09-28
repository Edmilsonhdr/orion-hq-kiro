"""Testes das rotas `GET /api/atividades` e `GET /api/atividades/tokens` (task 4.3).

Cobrem os Requirements 8.5 e 8.6: exigem sessão (401 sem cookie) e, com sessão,
devolvem as atividades/tokens do dia. Usam `TestClient` e a fixture `banco`
(Postgres efêmero) para ter dados reais.
"""

import importlib

import pytest
from fastapi.testclient import TestClient

from _orion import atividades

_SEGREDO = "segredo-de-teste-bem-longo-para-hmac"
_USUARIOS = "dimi:senha-dimi,jullyana:senha-jully"
_APROVADORES = "dimi,jullyana"


@pytest.fixture()
def cliente(monkeypatch, banco):
    """Cliente HTTP de teste com auth configurada e banco efêmero.

    Depende de `banco` para que as rotas leiam atividades reais e o
    DATABASE_URL aponte para o Postgres de teste.
    """
    monkeypatch.setenv("ORION_SESSION_SECRET", _SEGREDO)
    monkeypatch.setenv("ORION_USERS", _USUARIOS)
    monkeypatch.setenv("ORION_APPROVERS", _APROVADORES)

    import index

    importlib.reload(index)
    return TestClient(index.app, base_url="http://localhost")


def _logar(cliente):
    resp = cliente.post(
        "/api/login", json={"usuario": "dimi", "senha": "senha-dimi"}
    )
    assert resp.status_code == 200


def test_atividades_sem_sessao_da_401(cliente):
    assert cliente.get("/api/atividades").status_code == 401


def test_tokens_sem_sessao_da_401(cliente):
    assert cliente.get("/api/atividades/tokens").status_code == 401


def test_atividades_com_sessao_lista(cliente):
    atividades.emitir("run-1", "tech", "pensando", detalhe="a")
    atividades.emitir("run-1", "orq", "delegou", dados={"de": "orq", "para": "tech"})

    _logar(cliente)
    resp = cliente.get("/api/atividades")
    assert resp.status_code == 200
    corpo = resp.json()
    assert [a["id"] for a in corpo] == [1, 2]
    assert corpo[1]["dados"] == {"de": "orq", "para": "tech"}


def test_atividades_com_desde_filtra(cliente):
    for _ in range(3):
        atividades.emitir("run-1", "tech", "pensando")

    _logar(cliente)
    resp = cliente.get("/api/atividades", params={"desde": 1})
    assert resp.status_code == 200
    assert [a["id"] for a in resp.json()] == [2, 3]


def test_tokens_com_sessao_soma_por_agente(cliente):
    atividades.emitir("run-1", "tech", "pensando", tokens=10)
    atividades.emitir("run-1", "tech", "pensando", tokens=2)
    atividades.emitir("run-1", "orq", "pensando", tokens=5)

    _logar(cliente)
    resp = cliente.get("/api/atividades/tokens")
    assert resp.status_code == 200
    assert resp.json() == {"tech": 12, "orq": 5}
