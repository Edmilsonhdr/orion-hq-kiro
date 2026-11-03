"""Chat com várias conversas: isolamento de mensagens e de histórico, títulos e arquivamento."""

import importlib

import pytest
from fastapi.testclient import TestClient

from _orion import conversas, db, execucao


@pytest.fixture()
def cliente(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi")
    import index

    importlib.reload(index)
    c = TestClient(index.app, base_url="http://localhost")
    c.post("/api/login", json={"usuario": "dimi", "senha": "senha-dimi"})
    return c


def test_mensagens_ficam_na_propria_conversa(banco):
    a = conversas.criar("Vendas", "dimi")
    db.salvar_mensagem("dimi", "geral 1")
    db.salvar_mensagem("dimi", "vendas 1", conversa_id=a["id"])
    assert [m["texto"] for m in db.listar_mensagens(0)] == ["geral 1"]
    assert [m["texto"] for m in db.listar_mensagens(0, a["id"])] == ["vendas 1"]
    assert db.historico_recente(12, a["id"]) == "dimi: vendas 1"
    assert db.historico_recente(12) == "dimi: geral 1"


def test_resposta_do_run_cai_na_conversa_de_origem(banco):
    a = conversas.criar("Vendas", "dimi")
    resultado, estado = execucao.receber("dimi", "oi", a["id"])
    assert estado["run_id"] == resultado["run_id"]
    db.salvar_mensagem("Orquestrador", "resposta", estado["run_id"])
    assert [m["texto"] for m in db.listar_mensagens(0, a["id"])] == ["oi", "resposta"]
    assert db.listar_mensagens(0) == []


def test_rotas_criar_titular_arquivar(cliente):
    c = cliente.post("/api/conversas", json={}).json()
    assert c["titulo"] == "Nova conversa"
    r = cliente.post("/api/chat", json={"texto": "/nota planejar o lançamento", "conversa_id": c["id"]})
    assert r.status_code == 200
    lista = cliente.get("/api/conversas").json()
    assert lista[0]["titulo"] == "planejar o lançamento"
    assert [m["texto"] for m in cliente.get(f"/api/mensagens?conversa={c['id']}").json()][0].startswith("/nota")
    assert cliente.get("/api/mensagens").json() == []
    assert cliente.put(f"/api/conversas/{c['id']}", json={"titulo": "  "}).status_code == 422
    assert cliente.put(f"/api/conversas/{c['id']}", json={"titulo": "Lançamento"}).json()["titulo"] == "Lançamento"
    assert cliente.post(f"/api/conversas/{c['id']}/arquivar").status_code == 200
    assert cliente.get("/api/conversas").json() == []
    assert cliente.post("/api/chat", json={"texto": "oi", "conversa_id": c["id"]}).status_code == 404
    assert cliente.post("/api/chat", json={"texto": "oi", "conversa_id": 9999}).status_code == 404


def test_nova_conversa_vazia_e_reaproveitada(banco):
    a = conversas.criar(None, "dimi")
    assert conversas.criar(None, "dimi")["id"] == a["id"]
    assert conversas.criar(None, "jullyana")["id"] != a["id"]  # de outra pessoa
    db.salvar_mensagem("dimi", "oi", conversa_id=a["id"])
    assert conversas.criar(None, "dimi")["id"] != a["id"]  # a anterior já tem mensagem
    assert conversas.criar("Vendas", "dimi")["titulo"] == "Vendas"


def _com_resposta(pergunta="oq consegue me dizer do modulo comercial ?"):
    c = conversas.criar(None, "dimi")
    conversas.titular_se_nova(c["id"], pergunta)
    db.salvar_mensagem("dimi", pergunta, conversa_id=c["id"])
    db.salvar_mensagem("Orquestrador", "Funil vazio...", "run-1", conversa_id=c["id"])
    return c["id"]


def test_titulo_da_ia_substitui_o_provisorio(banco):
    cid = _com_resposta()
    assert conversas.titular_com_ia(cid, lambda p, r: ' "Retrato do módulo Comercial." ') == "Retrato do módulo Comercial"
    assert conversas.obter(cid)["titulo"] == "Retrato do módulo Comercial"


def test_titulo_da_ia_respeita_renomeacao_e_falhas(banco):
    cid = _com_resposta()
    conversas.renomear(cid, "Meu título")
    assert conversas.titular_com_ia(cid, lambda p, r: "Outro") is None
    assert conversas.obter(cid)["titulo"] == "Meu título"

    cid2 = _com_resposta("outra pergunta qualquer")

    def quebra(p, r):
        raise RuntimeError("sem chave")

    assert conversas.titular_com_ia(cid2, quebra) is None
    assert conversas.obter(cid2)["titulo"] == "outra pergunta qualquer"
    assert conversas.titular_com_ia(None) is None
