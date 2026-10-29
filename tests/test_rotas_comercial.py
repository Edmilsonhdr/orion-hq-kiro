"""Testes das rotas do Comercial (spec comercial, tarefa 5), com `TestClient`."""

import importlib

import pytest
from fastapi.testclient import TestClient

_SEGREDO = "segredo-de-teste-bem-longo-para-hmac"


@pytest.fixture()
def cliente(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", _SEGREDO)
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi,jullyana:senha-jully")
    monkeypatch.setenv("ORION_APPROVERS", "dimi,jullyana")
    import index

    importlib.reload(index)
    return TestClient(index.app, base_url="http://localhost")


@pytest.fixture()
def logado(cliente):
    assert cliente.post("/api/login", json={"usuario": "jullyana", "senha": "senha-jully"}).status_code == 200
    return cliente


_PROTEGIDAS = [
    ("get", "/api/comercial/resumo"), ("get", "/api/comercial/hoje"),
    ("get", "/api/comercial/negocios"), ("post", "/api/comercial/negocios"),
    ("get", "/api/comercial/negocios/1"), ("put", "/api/comercial/negocios/1"),
    ("post", "/api/comercial/negocios/1/etapa"), ("get", "/api/comercial/negocios/1/interacoes"),
    ("post", "/api/comercial/negocios/1/interacoes"), ("delete", "/api/comercial/interacoes/1"),
    ("get", "/api/comercial/organizacoes"), ("post", "/api/comercial/organizacoes"),
    ("get", "/api/comercial/organizacoes/1"), ("put", "/api/comercial/organizacoes/1"),
    ("post", "/api/comercial/organizacoes/1/arquivar"),
    ("post", "/api/comercial/organizacoes/1/contatos"), ("put", "/api/comercial/contatos/1"),
    ("delete", "/api/comercial/contatos/1"),
]


@pytest.mark.parametrize("metodo,rota", _PROTEGIDAS)
def test_exige_sessao(cliente, metodo, rota):
    assert getattr(cliente, metodo)(rota).status_code == 401


def test_fluxo_completo(logado):
    r = logado.post("/api/comercial/negocios", json={
        "organizacao_nome": "Nutri Ana", "organizacao_tipo": "autonomo",
        "titulo": "Piloto Ana", "valor_mensal": 49, "proximo_passo_em": "2026-11-10",
    })
    assert r.status_code == 201
    n = r.json()
    assert n["responsavel"] == "jullyana" and n["organizacao_tipo"] == "autonomo"
    nid, oid = n["id"], n["organizacao_id"]

    # Mesma organização, sem criar duplicada.
    r2 = logado.post("/api/comercial/negocios", json={"organizacao_nome": "nutri ana", "titulo": "Outro"})
    assert r2.json()["organizacao_id"] == oid

    assert logado.put(f"/api/comercial/negocios/{nid}", json={"proximo_passo": "Ligar"}).json()["proximo_passo"] == "Ligar"
    assert logado.post(f"/api/comercial/negocios/{nid}/etapa", json={"etapa": "demonstracao"}).json()["etapa"] == "demonstracao"
    i = logado.post(f"/api/comercial/negocios/{nid}/interacoes", json={"tipo": "ligacao", "resumo": "Falamos"})
    assert i.status_code == 201

    det = logado.get(f"/api/comercial/negocios/{nid}").json()
    assert {x["tipo"] for x in det["interacoes"]} == {"ligacao", "etapa", "alteracao"}
    sistema = next(x for x in det["interacoes"] if x["tipo"] == "etapa")
    assert logado.delete(f"/api/comercial/interacoes/{sistema['id']}").status_code == 409
    assert logado.delete(f"/api/comercial/interacoes/{i.json()['id']}").status_code == 200

    c = logado.post(f"/api/comercial/organizacoes/{oid}/contatos", json={"nome": "Ana", "email": "a@x.com"})
    assert c.status_code == 201
    org = logado.get(f"/api/comercial/organizacoes/{oid}").json()
    assert len(org["contatos"]) == 1 and len(org["negocios"]) == 2
    assert logado.put(f"/api/comercial/contatos/{c.json()['id']}", json={"cargo": "Dona"}).json()["cargo"] == "Dona"
    assert logado.delete(f"/api/comercial/contatos/{c.json()['id']}").status_code == 200

    assert logado.get("/api/comercial/resumo").json()["abertos"] == 2
    assert "vencidos" in logado.get("/api/comercial/hoje").json()
    assert len(logado.get("/api/comercial/negocios", params={"q": "piloto"}).json()) == 1


def test_erros(logado):
    assert logado.post("/api/comercial/negocios", json={"titulo": "x"}).status_code == 422  # sem org
    assert logado.post("/api/comercial/negocios", json={"organizacao_id": 999, "titulo": "x"}).status_code == 404
    assert logado.post("/api/comercial/organizacoes", json={"nome": ""}).status_code == 422
    assert logado.post("/api/comercial/organizacoes", json={"nome": "A"}).status_code == 201
    assert logado.post("/api/comercial/organizacoes", json={"nome": "a"}).status_code == 409
    n = logado.post("/api/comercial/negocios", json={"organizacao_nome": "A", "titulo": "T"}).json()
    base = f"/api/comercial/negocios/{n['id']}"
    assert logado.post(f"{base}/etapa", json={"etapa": "perdido"}).status_code == 422
    assert logado.post(f"{base}/etapa", json={"etapa": "xx"}).status_code == 422
    assert logado.post(f"{base}/interacoes", json={"tipo": "sms", "resumo": "x"}).status_code == 422
    assert logado.put(base, json={"valor_mensal": -3}).status_code == 422
    for rota in ("negocios/999", "organizacoes/999", "negocios/999/interacoes"):
        assert logado.get(f"/api/comercial/{rota}").status_code == 404
    assert logado.post("/api/comercial/negocios/999/etapa", json={"etapa": "lead"}).status_code == 404
    assert logado.delete("/api/comercial/interacoes/999").status_code == 404
    assert logado.delete("/api/comercial/contatos/999").status_code == 404
    assert logado.get("/api/comercial/negocios", params={"etapa": "xx"}).status_code == 422
