"""Auditoria das mudanças, segundo fator (TOTP) no login e métricas do piloto."""

import importlib
import time

import pytest
from fastapi.testclient import TestClient

from _orion import auditoria, comercial, db, totp


@pytest.fixture()
def app_(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi,rayssa:senha-ra")
    monkeypatch.setenv("ORION_APPROVERS", "dimi")
    import index

    importlib.reload(index)
    return index.app


def entrar(app, usuario="dimi", senha="senha-dimi", **extra):
    c = TestClient(app, base_url="http://localhost")
    r = c.post("/api/login", json={"usuario": usuario, "senha": senha, **extra})
    return c, r


# ---------- TOTP ----------

def test_codigo_totp_bate_com_o_vetor_da_rfc_6238():
    segredo = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"  # "12345678901234567890" em base32
    assert totp._codigo(segredo, 59 // 30) == "287082"  # RFC 6238, T=59, 6 dígitos (94287082 → 287082)
    assert totp.verificar(segredo, "287082", agora=59) == 1
    assert totp.verificar(segredo, "287082", ultimo_passo=1, agora=59) is None  # já usado
    assert totp.verificar(segredo, "000000", agora=59) is None
    assert totp.verificar(segredo, "abc", agora=59) is None


def test_login_com_segundo_fator(app_):
    c, _ = entrar(app_)
    assert c.get("/api/2fa").json() == {"estado": "sem"}
    cfg = c.post("/api/2fa/iniciar").json()
    assert cfg["uri"].startswith("otpauth://totp/Orion%20HQ:dimi?secret=")
    assert c.get("/api/2fa").json() == {"estado": "pendente"}
    assert c.post("/api/2fa/ativar", json={"codigo": "000000"}).status_code == 422
    assert c.post("/api/2fa/ativar", json={"codigo": totp.codigo_atual(cfg["segredo"])}).json() == {"estado": "ativo"}
    assert c.post("/api/2fa/iniciar").status_code == 409  # já ativo

    # login agora exige o código
    _, r = entrar(app_)
    assert r.status_code == 428
    _, r = entrar(app_, codigo="123456")
    assert r.status_code == 401
    # o código usado para ativar não vale de novo; o do próximo passo vale
    _, r = entrar(app_, codigo=totp.codigo_atual(cfg["segredo"]))
    assert r.status_code == 401
    db.executar("update totp set ultimo_passo = 0 where usuario = 'dimi'")
    logado, r = entrar(app_, codigo=totp.codigo_atual(cfg["segredo"]))
    assert r.status_code == 200 and logado.get("/api/me").status_code == 200
    # outra pessoa segue sem código
    assert entrar(app_, "rayssa", "senha-ra")[1].status_code == 200

    # desativar exige código válido (e novo)
    db.executar("update totp set ultimo_passo = 0 where usuario = 'dimi'")
    assert logado.post("/api/2fa/desativar", json={"codigo": "111111"}).status_code == 422
    assert logado.post("/api/2fa/desativar", json={"codigo": totp.codigo_atual(cfg["segredo"])}).json() == {"estado": "sem"}
    assert entrar(app_)[1].status_code == 200


def test_sem_a_tabela_o_login_segue_sem_segundo_fator(app_):
    db.executar("alter table totp rename to totp_fora")  # simula o banco sem o setup novo
    try:
        assert entrar(app_)[1].status_code == 200
    finally:
        db.executar("alter table totp_fora rename to totp")


# ---------- auditoria ----------

def test_auditoria_registra_mudancas_de_quem_esta_logado(app_):
    c, _ = entrar(app_)
    c.post("/api/documentos", json={"titulo": "Teste", "conteudo": "x", "pasta": None, "pai_id": None, "tags": []})
    c.get("/api/documentos")  # leitura não entra
    c.post("/api/presenca")  # batimento não entra
    TestClient(app_, base_url="http://localhost").post("/api/documentos", json={})  # sem sessão não entra
    linhas = auditoria.listar()
    assert [(l["usuario"], l["metodo"], l["caminho"], l["status"]) for l in linhas][:2] == [
        ("dimi", "POST", "/api/documentos", 201),
        ("dimi", "POST", "/api/login", 200),
    ]
    assert not any("presenca" in l["caminho"] for l in linhas)
    assert "Teste" not in str(linhas)  # nunca o conteúdo


def test_rota_de_auditoria_so_para_aprovadores_e_filtra(app_):
    dimi, _ = entrar(app_)
    dimi.post("/api/tarefas", json={"titulo": "t", "responsavel": "dimi"})
    ra, _ = entrar(app_, "rayssa", "senha-ra")
    assert ra.get("/api/auditoria").status_code == 403
    todos = dimi.get("/api/auditoria").json()
    assert {l["usuario"] for l in todos} == {"dimi", "rayssa"}
    assert {l["usuario"] for l in dimi.get("/api/auditoria?quem=rayssa").json()} == {"rayssa"}


def test_auditoria_nunca_derruba_a_requisicao(app_):
    db.executar("alter table auditoria rename to auditoria_fora")  # simula o banco sem o setup novo
    try:
        c, r = entrar(app_)
        assert r.status_code == 200
        assert c.post("/api/tarefas", json={"titulo": "t", "responsavel": "dimi"}).status_code == 201
    finally:
        db.executar("alter table auditoria_fora rename to auditoria")


def test_deve_registrar():
    assert auditoria.deve_registrar("POST", "/api/tarefas") and auditoria.deve_registrar("DELETE", "/api/x/1")
    assert not auditoria.deve_registrar("GET", "/api/tarefas")
    assert not auditoria.deve_registrar("POST", "/api/presenca") and not auditoria.deve_registrar("POST", "/api/cron/x")


# ---------- métricas do piloto ----------

@pytest.fixture()
def negocio(banco):
    org = comercial.criar_organizacao({"nome": "Clínica Vida"})
    return comercial.criar_negocio(org["id"], {"titulo": "Piloto"}, "dimi")


def test_metricas_do_piloto(app_, negocio):
    c, _ = entrar(app_)
    base = f"/api/comercial/negocios/{negocio['id']}/metricas"
    assert c.post(base, json={}).status_code == 422  # ao menos um número
    assert c.post(base, json={"pacientes_cadastrados": 5, "pacientes_registrando": 9}).status_code == 422
    assert c.post(base, json={"pacientes_cadastrados": -1}).status_code == 422
    a = c.post(base, json={"medido_em": "2026-10-27", "profissionais_ativos": 2, "pacientes_cadastrados": 10, "pacientes_registrando": 4}).json()
    c.post(base, json={"medido_em": "2026-11-03", "profissionais_ativos": 3, "pacientes_cadastrados": 12, "pacientes_registrando": 9, "observacao": "Semana 2"})
    lista = c.get(base).json()
    assert [m["medido_em"] for m in lista] == ["2026-11-03", "2026-10-27"] and [m["taxa_ativacao"] for m in lista] == [75, 40]
    assert c.post("/api/comercial/negocios/9999/metricas", json={"profissionais_ativos": 1}).status_code == 404
    assert c.delete(f"/api/comercial/metricas/{a['id']}").status_code == 200
    assert c.delete(f"/api/comercial/metricas/{a['id']}").status_code == 404
    assert len(c.get(base).json()) == 1
