"""Busca global (spec evolucao, requisito 1)."""

import importlib

import pytest
from fastapi.testclient import TestClient

from _orion import comercial, documentos


@pytest.fixture()
def cliente(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi")
    import index

    importlib.reload(index)
    return TestClient(index.app, base_url="http://localhost")


def test_exige_sessao(cliente):
    assert cliente.get("/api/busca?q=a").status_code == 401


def test_busca_em_tudo_e_limita(cliente):
    cliente.post("/api/login", json={"usuario": "dimi", "senha": "senha-dimi"})
    for i in range(7):
        documentos.criar(f"Guia de vendas {i}", "texto", autor="dimi")
    org = comercial.criar_organizacao({"nome": "Clínica Vendas Boas"})
    comercial.criar_negocio(org["id"], {"titulo": "Piloto de vendas"}, "dimi")
    r = cliente.get("/api/busca", params={"q": "vendas"}).json()
    assert len(r["documentos"]) == 5
    assert r["negocios"][0]["organizacao"] == "Clínica Vendas Boas"
    assert r["organizacoes"][0]["nome"] == "Clínica Vendas Boas"
    arquivado = documentos.criar("Vendas antigas", "x", autor="dimi")
    documentos.arquivar(arquivado["id"])
    assert all(d["titulo"] != "Vendas antigas" for d in cliente.get("/api/busca", params={"q": "antigas"}).json()["documentos"])


def test_consulta_vazia(cliente):
    cliente.post("/api/login", json={"usuario": "dimi", "senha": "senha-dimi"})
    assert cliente.get("/api/busca?q=%20").json() == {"documentos": [], "negocios": [], "organizacoes": [], "conversas": []}
    assert cliente.get("/api/busca?q=zzzxyz").json() == {"documentos": [], "negocios": [], "organizacoes": [], "conversas": []}
