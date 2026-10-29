"""Páginas dentro de páginas no Docs (spec docs-paginas)."""

import importlib

import pytest
from fastapi.testclient import TestClient

from _orion import documentos, ferramentas


def _doc(titulo, pai=None):
    return documentos.criar(titulo, "texto de " + titulo, autor="dimi", pai_id=pai)


def test_criar_subpagina_e_ancestrais(banco):
    a = _doc("A"); b = _doc("B", a["id"]); c = _doc("C", b["id"])
    assert c["pai_id"] == b["id"] and a["pai_id"] is None
    assert [x["titulo"] for x in documentos.ancestrais(c["id"])] == ["A", "B"]
    assert documentos.ancestrais(a["id"]) == []
    assert [x["titulo"] for x in documentos.subpaginas(a["id"])] == ["B"]


@pytest.mark.parametrize("pai", [999, "x"])
def test_pai_invalido(banco, pai):
    with pytest.raises(ValueError):
        _doc("A", pai)


def test_pai_arquivado_recusado(banco):
    a = _doc("A"); documentos.arquivar(a["id"])
    with pytest.raises(ValueError, match="arquivada"):
        _doc("B", a["id"])


def test_sem_ciclos(banco):
    a = _doc("A"); b = _doc("B", a["id"]); c = _doc("C", b["id"])
    with pytest.raises(ValueError, match="dentro dela mesma"):
        documentos.editar(a["id"], {"pai_id": a["id"]}, "dimi")
    with pytest.raises(ValueError, match="dentro dela mesma"):
        documentos.editar(a["id"], {"pai_id": c["id"]}, "dimi")


def test_profundidade_maxima(banco):
    atual = _doc("n1")
    for i in range(2, documentos.PROFUNDIDADE_MAX + 1):
        atual = _doc(f"n{i}", atual["id"])
    with pytest.raises(ValueError, match="níveis"):
        _doc("fundo demais", atual["id"])
    # Mover uma página com filhas para baixo também respeita o limite.
    topo = _doc("topo"); filha = _doc("filha", topo["id"])
    with pytest.raises(ValueError, match="níveis"):
        documentos.editar(topo["id"], {"pai_id": atual["id"]}, "dimi")
    assert filha["pai_id"] == topo["id"]


def test_mover_so_o_pai_nao_cria_versao(banco):
    a = _doc("A"); b = _doc("B")
    antes = documentos.obter(b["id"])["atualizado_em"]
    movido = documentos.editar(b["id"], {"pai_id": a["id"]}, "dimi")
    assert movido["pai_id"] == a["id"] and movido["atualizado_em"] > antes
    assert documentos.versoes(b["id"]) == []
    assert documentos.editar(b["id"], {"pai_id": None}, "dimi")["pai_id"] is None
    # Sem mudança real: nada acontece.
    assert documentos.editar(b["id"], {"pai_id": None}, "dimi")["atualizado_em"] == \
        documentos.obter(b["id"])["atualizado_em"]


def test_arquivar_leva_subpaginas_e_desarquivar_so_a_pedida(banco):
    a = _doc("A"); b = _doc("B", a["id"]); c = _doc("C", b["id"]); outra = _doc("Outra")
    documentos.arquivar(a["id"])
    assert all(documentos.obter(i["id"])["arquivado"] for i in (a, b, c))
    assert not documentos.obter(outra["id"])["arquivado"]
    assert documentos.arvore() == [{"id": outra["id"], "titulo": "Outra", "pai_id": None, "pasta": None}]
    documentos.arquivar(a["id"], False)
    assert not documentos.obter(a["id"])["arquivado"] and documentos.obter(b["id"])["arquivado"]
    assert documentos.subpaginas(a["id"]) == []


def test_arvore(banco):
    a = _doc("Beta"); b = _doc("alfa", a["id"])
    arv = documentos.arvore()
    assert [x["titulo"] for x in arv] == ["alfa", "Beta"]
    assert arv[0]["pai_id"] == a["id"]


def test_ler_documento_lista_subpaginas(banco):
    a = _doc("Guia"); b = _doc("Capítulo 1", a["id"])
    texto = ferramentas._ler_documento(a["id"])
    assert f"Subpáginas: #{b['id']} Capítulo 1" in texto
    assert "Subpáginas" not in ferramentas._ler_documento(b["id"])


# --- rotas ---


@pytest.fixture()
def cliente(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi")
    monkeypatch.setenv("ORION_APPROVERS", "dimi")
    import index

    importlib.reload(index)
    c = TestClient(index.app, base_url="http://localhost")
    assert c.post("/api/login", json={"usuario": "dimi", "senha": "senha-dimi"}).status_code == 200
    return c


def test_rotas(cliente):
    a = cliente.post("/api/documentos", json={"titulo": "A"}).json()
    b = cliente.post("/api/documentos", json={"titulo": "B", "pai_id": a["id"]})
    assert b.status_code == 201 and b.json()["pai_id"] == a["id"]
    det = cliente.get(f"/api/documentos/{b.json()['id']}").json()
    assert [x["titulo"] for x in det["ancestrais"]] == ["A"] and det["subpaginas"] == []
    assert [x["titulo"] for x in cliente.get(f"/api/documentos/{a['id']}").json()["subpaginas"]] == ["B"]
    assert len(cliente.get("/api/documentos/arvore").json()) == 2
    assert cliente.put(f"/api/documentos/{a['id']}", json={"pai_id": b.json()["id"]}).status_code == 422
    assert cliente.post("/api/documentos", json={"titulo": "C", "pai_id": 999}).status_code == 422
    assert cliente.put(f"/api/documentos/{b.json()['id']}", json={"pai_id": None}).json()["pai_id"] is None


def test_arvore_exige_sessao(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi")
    import index

    importlib.reload(index)
    assert TestClient(index.app, base_url="http://localhost").get("/api/documentos/arvore").status_code == 401
