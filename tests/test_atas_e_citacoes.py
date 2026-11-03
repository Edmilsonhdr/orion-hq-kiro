"""Retornos ("citado em") entre documentos e ata criada a partir da reunião."""

import importlib

import pytest
from fastapi.testclient import TestClient

from _orion import db, documentos


@pytest.fixture()
def cliente(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi")
    import index

    importlib.reload(index)
    c = TestClient(index.app, base_url="http://localhost")
    c.post("/api/login", json={"usuario": "dimi", "senha": "senha-dimi"})
    return c


def test_citacoes(banco):
    alvo = documentos.criar("Guia 100%", "texto", None, [], autor="dimi")
    a = documentos.criar("Quem cita", "veja [[Guia 100%]] e mais", None, [], autor="dimi")
    documentos.criar("Não cita", "veja [[Outro]]", None, [], autor="dimi")
    arq = documentos.criar("Arquivado", "[[Guia 100%]]", None, [], autor="dimi")
    documentos.arquivar(arq["id"])
    documentos.criar("Parecido", "Guia 100% sem colchetes", None, [], autor="dimi")
    assert [c["id"] for c in documentos.citacoes(alvo["id"])] == [a["id"]]
    assert documentos.citacoes(999999) == []


def test_ata_da_reuniao_e_idempotente(cliente):
    db.executar("insert into reunioes (titulo, inicio, fim, participantes, pauta) values ('Demo Clínica Vida', '2026-11-03T17:00:00Z', '2026-11-03T18:00:00Z', '{dimi,jullyana}', '{Apresentar o piloto,Combinar valores}')")
    rid = db.um("select id from reunioes")["id"]
    r = cliente.post(f"/api/reunioes/{rid}/ata")
    assert r.status_code == 200 and r.json()["criado"] is True
    doc = documentos.obter(r.json()["id"])
    assert doc["titulo"] == "Ata: Demo Clínica Vida (03/11/2026)" and doc["pasta"] == "Reuniões" and doc["tags"] == ["ata"]
    assert "14:00 às 15:00" in doc["conteudo"] and "dimi, jullyana" in doc["conteudo"] and "- Apresentar o piloto" in doc["conteudo"]
    de_novo = cliente.post(f"/api/reunioes/{rid}/ata").json()
    assert de_novo["id"] == r.json()["id"] and de_novo["criado"] is False
    assert cliente.post("/api/reunioes/9999/ata").status_code == 404
    assert cliente.get(f"/api/documentos/{doc['id']}/citacoes").json() == []
