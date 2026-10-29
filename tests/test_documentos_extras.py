"""Docs: ordem das subpáginas, comentários com menção e subpáginas na exportação/importação."""

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from _orion import documentos, exportacao, importacao


@pytest.fixture()
def cliente(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi,jullyana:senha-ju")
    import index

    importlib.reload(index)

    def entrar(usuario, senha):
        c = TestClient(index.app, base_url="http://localhost")
        c.post("/api/login", json={"usuario": usuario, "senha": senha})
        return c

    return entrar


def test_mover_subpagina_para_cima_e_para_baixo(banco):
    pai = documentos.criar("Pai", "x", autor="dimi")
    a = documentos.criar("A", "x", autor="dimi", pai_id=pai["id"])
    b = documentos.criar("B", "x", autor="dimi", pai_id=pai["id"])
    c = documentos.criar("C", "x", autor="dimi", pai_id=pai["id"])
    assert [s["titulo"] for s in documentos.subpaginas(pai["id"])] == ["A", "B", "C"]
    documentos.mover_subpagina(c["id"], "cima")
    assert [s["titulo"] for s in documentos.subpaginas(pai["id"])] == ["A", "C", "B"]
    documentos.mover_subpagina(a["id"], "baixo")
    assert [s["titulo"] for s in documentos.subpaginas(pai["id"])] == ["C", "A", "B"]
    documentos.mover_subpagina(c["id"], "cima")  # já é a primeira: nada muda
    assert [s["titulo"] for s in documentos.subpaginas(pai["id"])] == ["C", "A", "B"]
    with pytest.raises(ValueError):
        documentos.mover_subpagina(a["id"], "lado")
    assert documentos.mover_subpagina(9999, "cima") is None


def test_comentarios_e_mencoes(cliente):
    dimi, ju = cliente("dimi", "senha-dimi"), cliente("jullyana", "senha-ju")
    doc = dimi.post("/api/documentos", json={"titulo": "Plano", "conteudo": "x"}).json()
    r = ju.post(f"/api/documentos/{doc['id']}/comentarios", json={"texto": "Oi @dimi, revisa por favor?"})
    assert r.status_code == 201
    cid = r.json()["id"]
    assert dimi.post(f"/api/documentos/{doc['id']}/comentarios", json={"texto": "  "}).status_code == 422
    assert len(dimi.get(f"/api/documentos/{doc['id']}/comentarios").json()) == 1
    # a menção aparece para quem foi citado, não para quem escreveu
    assert [m["documento_titulo"] for m in dimi.get("/api/mencoes").json()] == ["Plano"]
    assert ju.get("/api/mencoes").json() == []
    # só o autor apaga
    assert dimi.delete(f"/api/documentos/comentarios/{cid}").status_code == 403
    assert ju.delete(f"/api/documentos/comentarios/{cid}").status_code == 200
    assert dimi.get("/api/mencoes").json() == []
    assert dimi.post("/api/documentos/9999/comentarios", json={"texto": "a"}).status_code == 404


def test_exporta_e_importa_subpaginas(banco, tmp_path: Path):
    pai = documentos.criar("Manual", "raiz", "Guias", autor="dimi")
    documentos.criar("Capítulo 1", "filho", "Guias", autor="dimi", pai_id=pai["id"])
    destino = tmp_path / "saida"
    exportacao.exportar(destino)
    # banco limpo: reimporta tudo e confere a hierarquia
    from _orion import db

    db.executar("truncate table documento_versoes, documentos restart identity cascade")
    rel = importacao.importar(destino, aplicar=True)
    assert rel["subpaginas"] == 1
    filho = db.um("select pai_id from documentos where titulo = 'Capítulo 1'")
    raiz = db.um("select id from documentos where titulo = 'Manual'")
    assert filho["pai_id"] == raiz["id"]
