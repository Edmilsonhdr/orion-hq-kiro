"""Guardião de docs: escolhe documentos desatualizados e PROPÕE ajustes (nunca grava sozinho)."""

import importlib

import pytest
from fastapi.testclient import TestClient

from _orion import db, documentos, guardiao
from _orion.guardiao import Ajuste, Candidato, Revisao

GUIA = "Orion (guia de uso)"


@pytest.fixture()
def docs(banco):
    a = documentos.criar("Consultas", "As consultas duram 60 minutos.\n\nO paciente recebe aviso no app.", GUIA, [], autor="dimi")
    b = documentos.criar("Glossário", "Termos.", GUIA, [], autor="dimi")
    fora = documentos.criar("Comercial", "Proposta.", "Comercial", [], autor="dimi")
    return a, b, fora


def _mudanca():
    db.executar("insert into changelog (fonte, referencia, titulo, resumo, autor) values ('github', 'pr-1', 'Duração configurável', 'A consulta passa a ter 30, 45, 60 ou 90 minutos.', 'x')")


def _propostas():
    return db.consultar("select proposta, status from aprovacoes where tipo = 'editar_documento'")


def test_aplicar_ajustes_so_quando_o_trecho_e_unico():
    texto = "a b a c"
    novo, n = guardiao.aplicar_ajustes(texto, [Ajuste(antes="a", depois="x"), Ajuste(antes="c", depois="d"), Ajuste(antes="", depois="z"), Ajuste(antes="b", depois="b"), Ajuste(antes="nao existe", depois="q")])
    assert (novo, n) == ("a b a d", 1)  # "a" aparece duas vezes: recusado


def test_sem_mudancas_nao_faz_nada(docs):
    assert guardiao.revisar() == {"status": "sem_mudancas", "propostas": []}
    assert _propostas() == []


def test_propoe_a_edicao_sem_gravar(docs):
    a, b, fora = docs
    _mudanca()
    vistos = {}

    def escolher(mudancas, catalogo, limite):
        vistos["catalogo"] = catalogo
        return [Candidato(documento_id=a["id"], motivo="duração agora é configurável"), Candidato(documento_id=fora["id"], motivo="fora das pastas"), Candidato(documento_id=999, motivo="inexistente")]

    def ajustar(titulo, conteudo, mudancas, motivo):
        return Revisao(ajustes=[Ajuste(antes="duram 60 minutos", depois="duram 30, 45, 60 ou 90 minutos"), Ajuste(antes="trecho inventado", depois="x")], resumo="Duração configurável.")

    r = guardiao.revisar(escolher=escolher, ajustar=ajustar)
    assert r["status"] == "propostas" and [p["titulo"] for p in r["propostas"]] == ["Consultas"] and r["propostas"][0]["ajustes"] == 1
    assert "Comercial" not in vistos["catalogo"] and "Consultas" in vistos["catalogo"]  # só as pastas do produto
    assert documentos.obter(a["id"])["conteudo"].startswith("As consultas duram 60 minutos")  # nada gravado
    [proposta] = _propostas()
    assert proposta["status"] == "pendente" and "30, 45, 60 ou 90" in proposta["proposta"]["campos"]["conteudo"]
    assert any("Guardião de docs" in m["texto"] for m in db.listar_mensagens(0))

    # com uma edição pendente, o documento não é oferecido de novo
    guardiao.revisar(escolher=lambda m, c, l: (vistos.update(catalogo2=c) or []), ajustar=ajustar)
    assert "Consultas" not in vistos["catalogo2"] and "Glossário" in vistos["catalogo2"]


def test_falha_num_documento_nao_derruba_os_outros(docs):
    a, b, _ = docs
    _mudanca()

    def ajustar(titulo, conteudo, mudancas, motivo):
        if titulo == "Consultas":
            raise RuntimeError("modelo fora do ar")
        return Revisao(ajustes=[Ajuste(antes="Termos.", depois="Termos e siglas.")], resumo="Glossário.")

    r = guardiao.revisar(escolher=lambda m, c, l: [Candidato(documento_id=a["id"], motivo="x"), Candidato(documento_id=b["id"], motivo="y")], ajustar=ajustar)
    assert [p["titulo"] for p in r["propostas"]] == ["Glossário"]


def test_sem_ajustes_validos_nao_propoe(docs):
    a, _, _ = docs
    _mudanca()
    r = guardiao.revisar(escolher=lambda m, c, l: [Candidato(documento_id=a["id"], motivo="x")],
                         ajustar=lambda *args: Revisao(ajustes=[Ajuste(antes="não existe", depois="y")], resumo=""))
    assert r == {"status": "sem_propostas", "propostas": []} and _propostas() == []


def test_rota_manual_so_para_aprovadores(banco, monkeypatch):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:a,rayssa:b")
    monkeypatch.setenv("ORION_APPROVERS", "dimi")
    import index

    importlib.reload(index)

    def entrar(u, s):
        c = TestClient(index.app, base_url="http://localhost")
        c.post("/api/login", json={"usuario": u, "senha": s})
        return c

    assert entrar("rayssa", "b").post("/api/guardiao/executar").status_code == 403
    assert TestClient(index.app, base_url="http://localhost").post("/api/guardiao/executar").status_code == 401
    r = entrar("dimi", "a").post("/api/guardiao/executar")
    assert r.status_code == 200 and r.json()["status"] == "sem_mudancas"
