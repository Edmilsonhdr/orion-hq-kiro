"""Limite de tentativas de login (429 depois de 5 falhas em 15 minutos)."""

import importlib

import pytest
from fastapi.testclient import TestClient

from _orion import db


@pytest.fixture()
def cliente(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi")
    import index

    importlib.reload(index)
    return TestClient(index.app, base_url="http://localhost")


def _errar(cliente, n):
    return [cliente.post("/api/login", json={"usuario": "dimi", "senha": "x"}).status_code for _ in range(n)]


def test_bloqueia_depois_de_cinco_falhas_mesmo_com_senha_certa(cliente):
    assert _errar(cliente, 5) == [401] * 5
    r = cliente.post("/api/login", json={"usuario": "dimi", "senha": "senha-dimi"})
    assert r.status_code == 429


def test_sucesso_zera_o_contador(cliente):
    _errar(cliente, 4)
    assert cliente.post("/api/login", json={"usuario": "dimi", "senha": "senha-dimi"}).status_code == 200
    assert _errar(cliente, 4) == [401] * 4


def test_falhas_antigas_nao_contam(cliente):
    _errar(cliente, 5)
    db.executar("update login_tentativas set criado_em = now() - interval '20 minutes'")
    assert cliente.post("/api/login", json={"usuario": "dimi", "senha": "senha-dimi"}).status_code == 200
