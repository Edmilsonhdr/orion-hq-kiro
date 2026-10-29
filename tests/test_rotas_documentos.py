"""Testes das rotas de documentos (spec docs, tarefa 3), com `TestClient`.

Segue o padrão de `tests/test_rotas_incidentes.py` (fixture `cliente` recarregando `index`).
"""

import importlib

import pytest
from fastapi.testclient import TestClient

from _orion import documentos

_SEGREDO = "segredo-de-teste-bem-longo-para-hmac"
_USUARIOS = "dimi:senha-dimi,jullyana:senha-jully"


@pytest.fixture()
def cliente(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", _SEGREDO)
    monkeypatch.setenv("ORION_USERS", _USUARIOS)
    monkeypatch.setenv("ORION_APPROVERS", "dimi,jullyana")

    import index

    importlib.reload(index)
    return TestClient(index.app, base_url="http://localhost")


def _logar(cliente, usuario="dimi", senha="senha-dimi"):
    resp = cliente.post("/api/login", json={"usuario": usuario, "senha": senha})
    assert resp.status_code == 200


_ROTAS_PROTEGIDAS = [
    ("get", "/api/documentos"),
    ("get", "/api/documentos/pastas"),
    ("post", "/api/documentos"),
    ("get", "/api/documentos/1"),
    ("put", "/api/documentos/1"),
    ("post", "/api/documentos/1/arquivar"),
    ("get", "/api/documentos/1/versoes"),
    ("get", "/api/documentos/1/versoes/1"),
    ("post", "/api/documentos/1/versoes/1/restaurar"),
]


@pytest.mark.parametrize("metodo,caminho", _ROTAS_PROTEGIDAS)
def test_rotas_exigem_sessao(cliente, metodo, caminho):
    corpo = {"json": {"titulo": "x", "arquivado": True}} if metodo != "get" else {}
    assert getattr(cliente, metodo)(caminho, **corpo).status_code == 401


def test_criar_usa_usuario_da_sessao(cliente):
    _logar(cliente, "jullyana", "senha-jully")
    resp = cliente.post(
        "/api/documentos",
        json={"titulo": "Plano", "conteudo": "# oi", "pasta": "Produto", "tags": ["MVP"]},
    )
    assert resp.status_code == 201
    corpo = resp.json()
    assert corpo["autor"] == "jullyana" and corpo["tags"] == ["mvp"]


@pytest.mark.parametrize(
    "corpo",
    [{"titulo": "   "}, {"titulo": "a" * 201}, {"titulo": "ok", "conteudo": "a" * 200_001}],
)
def test_criar_invalido_422(cliente, corpo):
    _logar(cliente)
    resp = cliente.post("/api/documentos", json=corpo)
    assert resp.status_code == 422
    assert documentos.listar() == []


def test_inexistente_404(cliente):
    _logar(cliente)
    assert cliente.get("/api/documentos/999").status_code == 404
    assert cliente.put("/api/documentos/999", json={"titulo": "x"}).status_code == 404
    assert cliente.post("/api/documentos/999/arquivar", json={}).status_code == 404
    assert cliente.get("/api/documentos/999/versoes").status_code == 404
    assert cliente.get("/api/documentos/999/versoes/1").status_code == 404
    assert cliente.post("/api/documentos/999/versoes/1/restaurar").status_code == 404


def test_fluxo_completo(cliente):
    _logar(cliente)
    doc = cliente.post("/api/documentos", json={"titulo": "V1", "conteudo": "a"}).json()
    did = doc["id"]

    editado = cliente.put(f"/api/documentos/{did}", json={"conteudo": "b"}).json()
    assert editado["conteudo"] == "b" and editado["titulo"] == "V1"

    versoes = cliente.get(f"/api/documentos/{did}/versoes").json()
    assert len(versoes) == 1 and "conteudo" not in versoes[0]
    antiga = cliente.get(f"/api/documentos/{did}/versoes/{versoes[0]['id']}").json()
    assert antiga["conteudo"] == "a"

    restaurado = cliente.post(
        f"/api/documentos/{did}/versoes/{versoes[0]['id']}/restaurar"
    ).json()
    assert restaurado["conteudo"] == "a"
    assert len(cliente.get(f"/api/documentos/{did}/versoes").json()) == 2

    assert cliente.post(f"/api/documentos/{did}/arquivar", json={}).json()["arquivado"]
    assert cliente.get("/api/documentos").json() == []
    assert len(cliente.get("/api/documentos?arquivados=true").json()) == 1


def test_put_so_altera_campos_enviados(cliente):
    _logar(cliente)
    did = cliente.post(
        "/api/documentos", json={"titulo": "T", "conteudo": "c", "pasta": "P"}
    ).json()["id"]
    editado = cliente.put(f"/api/documentos/{did}", json={"tags": ["x"]}).json()
    assert editado["titulo"] == "T" and editado["pasta"] == "P" and editado["tags"] == ["x"]
    limpo = cliente.put(f"/api/documentos/{did}", json={"pasta": None}).json()
    assert limpo["pasta"] is None


def test_put_invalido_422(cliente):
    _logar(cliente)
    did = cliente.post("/api/documentos", json={"titulo": "T"}).json()["id"]
    assert cliente.put(f"/api/documentos/{did}", json={"titulo": " "}).status_code == 422


def test_listagem_busca_e_filtros(cliente):
    _logar(cliente)
    cliente.post("/api/documentos", json={"titulo": "Preço", "conteudo": "cobrar mensal", "pasta": "Negócio", "tags": ["preco"]})
    cliente.post("/api/documentos", json={"titulo": "API", "conteudo": "rotas", "pasta": "Tech"})
    assert len(cliente.get("/api/documentos").json()) == 2
    assert [d["titulo"] for d in cliente.get("/api/documentos?q=mensal").json()] == ["Preço"]
    assert [d["titulo"] for d in cliente.get("/api/documentos?pasta=Tech").json()] == ["API"]
    assert [d["titulo"] for d in cliente.get("/api/documentos?tag=preco").json()] == ["Preço"]
    filtros = cliente.get("/api/documentos/pastas").json()
    assert filtros["pastas"] == ["Negócio", "Tech"] and filtros["tags"] == ["preco"]
    assert filtros["contagem_pastas"] == {"Negócio": 1, "Tech": 1} and filtros["total"] == 2
