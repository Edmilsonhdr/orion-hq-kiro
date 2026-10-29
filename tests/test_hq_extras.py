"""Histórico de alterações, checklist de piloto, anexos, backup e busca global."""

import base64
import importlib
import json

import pytest
from fastapi.testclient import TestClient

from _orion import anexos, backup, busca, comercial, conversas, documentos


@pytest.fixture()
def cliente(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi,jullyana:senha-ju")
    import index

    importlib.reload(index)
    c = TestClient(index.app, base_url="http://localhost")
    c.post("/api/login", json={"usuario": "dimi", "senha": "senha-dimi"})
    return c


def _negocio(titulo="Piloto Sol", etapa="lead"):
    org = comercial.criar_organizacao({"nome": f"Org {titulo}", "tipo": "clinica"})
    return comercial.criar_negocio(org["id"], {"titulo": titulo, "etapa": etapa}, "dimi")


def test_historico_registra_criacao_e_so_o_que_mudou(banco):
    n = _negocio()
    comercial.editar_negocio(n["id"], {"valor_mensal": 300, "origem": "indicação"}, "jullyana")
    comercial.editar_negocio(n["id"], {"valor_mensal": 300}, "jullyana")  # nada mudou: não registra
    eventos = [i for i in comercial.listar_interacoes(n["id"]) if i["tipo"] == "alteracao"]
    assert len(eventos) == 2
    assert any(e["resumo"] == "Negócio criado em Lead" and e["autor"] == "dimi" for e in eventos)
    mudanca = next(e for e in eventos if e["autor"] == "jullyana")
    assert "Valor mensal: vazio → R$ 300,00" in mudanca["resumo"]
    assert "Origem: vazio → indicação" in mudanca["resumo"]
    assert comercial.excluir_interacao(mudanca["id"]) == "do_sistema"


def test_checklist_do_piloto(banco):
    n = _negocio(etapa="piloto")
    itens = comercial.itens_piloto(n["id"])
    assert len(itens) == len(comercial.ITENS_PILOTO)
    assert comercial.itens_piloto(n["id"]) == itens  # não duplica
    feito = comercial.marcar_item_piloto(itens[0]["id"], True, "dimi")
    assert feito["feito"] and feito["feito_por"] == "dimi"
    novo = comercial.adicionar_item_piloto(n["id"], "Enviar contrato")
    assert novo["ordem"] == len(itens)
    lista = comercial.pilotos()
    assert len(lista) == 1
    assert (lista[0]["itens_total"], lista[0]["itens_feitos"], lista[0]["dias_no_piloto"]) == (len(itens) + 1, 1, 0)
    assert comercial.remover_item_piloto(novo["id"]) and not comercial.remover_item_piloto(novo["id"])
    # fora do piloto não cria itens sozinho
    assert comercial.itens_piloto(_negocio("Outro")["id"]) == []
    assert comercial.itens_piloto(99999) is None


def test_anexos_validam_tipo_tamanho_e_dono(banco):
    doc = documentos.criar("Com anexo", "x", autor="dimi")
    a = anexos.criar("documento", doc["id"], "proposta final.pdf", b"%PDF-1.4 abc", "dimi")
    assert a["tipo"] == "application/pdf" and a["tamanho"] == 12 and "conteudo" not in a
    assert anexos.obter(a["id"])["conteudo"] == b"%PDF-1.4 abc"
    assert [x["nome"] for x in anexos.listar("documento", doc["id"])] == ["proposta final.pdf"]
    with pytest.raises(ValueError):
        anexos.criar("documento", doc["id"], "script.svg", b"<svg/>", "dimi")
    with pytest.raises(ValueError):
        anexos.criar("documento", doc["id"], "vazio.pdf", b"", "dimi")
    with pytest.raises(ValueError):
        anexos.criar("documento", doc["id"], "grande.pdf", b"0" * (anexos.TAMANHO_MAX + 1), "dimi")
    assert anexos.criar("documento", 99999, "a.pdf", b"x", "dimi") is None
    assert anexos.limpar_nome("..\\..\\etc/passwd.pdf") == "passwd.pdf"
    assert anexos.excluir(a["id"]) and not anexos.excluir(a["id"])


def test_rotas_de_anexo(cliente):
    n = _negocio()
    r = cliente.post(f"/api/anexos?entidade=negocio&id={n['id']}&nome=print.png", content=b"\x89PNG....")
    assert r.status_code == 201
    aid = r.json()["id"]
    baixou = cliente.get(f"/api/anexos/{aid}")
    assert baixou.status_code == 200 and baixou.content == b"\x89PNG...."
    assert baixou.headers["content-type"] == "image/png"
    assert baixou.headers["content-disposition"].startswith("inline")
    assert baixou.headers["x-content-type-options"] == "nosniff"
    assert len(cliente.get(f"/api/anexos?entidade=negocio&id={n['id']}").json()) == 1
    assert cliente.post(f"/api/anexos?entidade=negocio&id={n['id']}&nome=x.exe", content=b"x").status_code == 422
    assert cliente.post("/api/anexos?entidade=negocio&id=99999&nome=x.pdf", content=b"x").status_code == 404
    assert cliente.delete(f"/api/anexos/{aid}").status_code == 200
    assert cliente.get(f"/api/anexos/{aid}").status_code == 404


def test_rotas_exigem_sessao(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi")
    import index

    importlib.reload(index)
    anon = TestClient(index.app, base_url="http://localhost")
    for caminho in ("/api/backup", "/api/busca?q=ab", "/api/anexos/1", "/api/comercial/pilotos"):
        assert anon.get(caminho).status_code == 401


def test_backup_traz_tudo_e_anexos_em_base64(cliente):
    n = _negocio()
    doc = documentos.criar("Doc do backup", "conteúdo", autor="dimi")
    anexos.criar("documento", doc["id"], "a.txt", b"ola", "dimi")
    r = cliente.get("/api/backup")
    assert r.status_code == 200
    assert "orion-hq-backup-" in r.headers["content-disposition"]
    dados = json.loads(r.content)
    assert dados["contagem"]["documentos"] == 1 and dados["contagem"]["negocios"] == 1
    assert base64.b64decode(dados["tabelas"]["anexos"][0]["conteudo"]) == b"ola"
    assert dados["tabelas"]["negocios"][0]["id"] == n["id"]
    leve = json.loads(cliente.get("/api/backup?anexos_incluidos=false").content)
    assert "conteudo" not in leve["tabelas"]["anexos"][0]
    assert set(json.loads(backup.como_json())["tabelas"]) == set(backup.TABELAS)


def test_busca_global_inclui_conversas(cliente):
    documentos.criar("Roteiro de vendas", "fale com a Clínica Aurora", autor="dimi")
    n = _negocio("Aurora piloto")
    conv = conversas.criar("Plano Aurora", "dimi")
    assert busca.conversas("a") == []
    r = cliente.get("/api/busca?q=aurora").json()
    assert [d["titulo"] for d in r["documentos"]] == ["Roteiro de vendas"]
    assert [x["id"] for x in r["negocios"]] == [n["id"]]
    assert [c["id"] for c in r["conversas"]] == [conv["id"]]
    assert busca.conversas("100%") == []  # % não vira curinga
    assert cliente.get("/api/busca?q=").json()["conversas"] == []
