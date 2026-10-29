"""Importação de planilha CSV do Comercial."""

import importlib

import pytest
from fastapi.testclient import TestClient

from _orion import comercial, db


@pytest.fixture()
def cliente(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi")
    import index

    importlib.reload(index)
    c = TestClient(index.app, base_url="http://localhost")
    c.post("/api/login", json={"usuario": "dimi", "senha": "senha-dimi"})
    return c


CSV = (
    "Organização;Tipo;Cidade;Contato;E-mail;Telefone\n"
    "Clínica Sol;clínica;Recife;Ana Souza;ana@sol.com;81999990000\n"
    "Dr. Leo;autônomo;Olinda;;;\n"
    "Clínica Sol;clinica;Recife;Ana Souza;ana@sol.com;81999990000\n"
    ";clinica;;;;\n"
)


def test_importa_com_ponto_e_virgula_sem_duplicar_e_reporta_erro(banco):
    r = comercial.importar_csv(CSV, "dimi")
    assert r["organizacoes"] == 2
    assert r["contatos"] == 1
    assert r["negocios"] == 2
    assert [e["linha"] for e in r["erros"]] == [5]
    leo = db.um("select tipo, cidade from organizacoes where nome = 'Dr. Leo'")
    assert leo["tipo"] == "autonomo" and leo["cidade"] == "Olinda"


def test_exige_coluna_da_organizacao(banco):
    with pytest.raises(ValueError):
        comercial.importar_csv("a,b\n1,2\n", "dimi")


def test_rota_exige_sessao_e_importa(cliente):
    r = cliente.post("/api/comercial/importar", json={"csv": "empresa,contato\nAcme,Zé\n"})
    assert r.status_code == 200 and r.json()["organizacoes"] == 1
    cliente.cookies.clear()
    assert cliente.post("/api/comercial/importar", json={"csv": "x"}).status_code == 401
    
