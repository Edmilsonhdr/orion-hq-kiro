"""Presença no HQ (spec evolucao): heartbeat e lista de quem está online."""

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


def test_exige_sessao(cliente):
    assert cliente.post("/api/presenca").status_code == 401
    assert cliente.get("/api/presenca").status_code == 401


def test_heartbeat_aparece_online_e_expira(cliente):
    cliente.post("/api/login", json={"usuario": "dimi", "senha": "senha-dimi"})
    assert cliente.get("/api/presenca").json() == []
    assert cliente.post("/api/presenca").json() == {"ok": True}
    assert cliente.get("/api/presenca").json() == ["dimi"]
    db.executar("update presenca set visto_em = now() - interval '5 minutes'")
    assert cliente.get("/api/presenca").json() == []
