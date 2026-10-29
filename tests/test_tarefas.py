"""Tarefas: quadro Kanban por pessoa."""

import importlib

import pytest
from fastapi.testclient import TestClient

from _orion import backup, tarefas


@pytest.fixture()
def cliente(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi,jullyana:senha-ju,rayssa:senha-ra")
    import index

    importlib.reload(index)

    def entrar(usuario="dimi", senha="senha-dimi"):
        c = TestClient(index.app, base_url="http://localhost")
        c.post("/api/login", json={"usuario": usuario, "senha": senha})
        return c

    return entrar


@pytest.fixture(autouse=True)
def usuarios(monkeypatch):
    monkeypatch.setenv("ORION_USERS", "dimi:a,jullyana:b,rayssa:c")


def test_criar_valida_e_atribui_ao_autor_por_padrao(banco):
    t = tarefas.criar({"titulo": "  Ligar para a Clínica Sol  "}, "dimi")
    assert (t["titulo"], t["status"], t["responsavel"], t["prioridade"], t["ordem"]) == ("Ligar para a Clínica Sol", "a_fazer", "dimi", "normal", 0)
    outra = tarefas.criar({"titulo": "Enviar proposta", "responsavel": "rayssa", "prazo": "2026-11-05", "prioridade": "alta"}, "dimi")
    assert outra["responsavel"] == "rayssa" and str(outra["prazo"]) == "2026-11-05" and outra["criado_por"] == "dimi"
    for ruim in ({}, {"titulo": " "}, {"titulo": "x", "responsavel": "ninguem"}, {"titulo": "x", "prioridade": "urgente"}, {"titulo": "x", "prazo": "amanhã"}, {"titulo": "x" * 201}):
        with pytest.raises(ValueError):
            tarefas.criar(ruim, "dimi")


def test_mover_entre_colunas_e_posicao(banco):
    a, b, c = (tarefas.criar({"titulo": n}, "dimi") for n in "ABC")
    assert [t["titulo"] for t in tarefas.listar("dimi")] == ["A", "B", "C"]
    tarefas.mover(c["id"], "fazendo")
    tarefas.mover(a["id"], "fazendo", 0)  # A entra antes de C
    por_status = {s: [t["titulo"] for t in tarefas.listar("dimi") if t["status"] == s] for s in ("a_fazer", "fazendo", "bloqueada", "feito")}
    assert por_status == {"a_fazer": ["B"], "fazendo": ["A", "C"], "bloqueada": [], "feito": []}
    feita = tarefas.mover(b["id"], "feito")
    assert feita["concluida_em"] is not None
    reaberta = tarefas.mover(b["id"], "a_fazer")
    assert reaberta["concluida_em"] is None
    with pytest.raises(ValueError):
        tarefas.mover(a["id"], "arquivada")
    assert tarefas.mover(9999, "feito") is None


def test_feitas_antigas_saem_do_quadro(banco):
    t = tarefas.criar({"titulo": "Velha"}, "dimi")
    tarefas.mover(t["id"], "feito")
    assert len(tarefas.listar()) == 1
    from _orion import db

    db.executar("update tarefas set concluida_em = now() - interval '20 days' where id = %s", (t["id"],))
    assert tarefas.listar() == []


def test_editar_troca_de_responsavel_e_resumo(banco):
    t = tarefas.criar({"titulo": "Revisar", "prazo": "2020-01-01"}, "dimi")
    e = tarefas.editar(t["id"], {"responsavel": "jullyana", "prioridade": "alta", "descricao": "  detalhe  "})
    assert (e["responsavel"], e["prioridade"], e["descricao"]) == ("jullyana", "alta", "detalhe")
    assert tarefas.editar(t["id"], {"prazo": None})["prazo"] is None
    assert tarefas.editar(9999, {"titulo": "x"}) is None
    tarefas.criar({"titulo": "Vencida", "prazo": "2020-01-01", "responsavel": "rayssa"}, "dimi")
    r = tarefas.resumo_por_pessoa()
    assert r["dimi"] == {"abertas": 0, "vencidas": 0}
    assert r["jullyana"]["abertas"] == 1 and r["rayssa"] == {"abertas": 1, "vencidas": 1}


def test_rotas(cliente):
    c = cliente()
    assert c.get("/api/usuarios").json() == ["dimi", "jullyana", "rayssa"]
    r = c.post("/api/tarefas", json={"titulo": "Fechar piloto", "responsavel": "jullyana"})
    assert r.status_code == 201
    tid = r.json()["id"]
    assert c.post("/api/tarefas", json={"titulo": ""}).status_code == 422
    assert c.put(f"/api/tarefas/{tid}", json={"prazo": "2026-12-01"}).json()["prazo"] == "2026-12-01"
    assert c.post(f"/api/tarefas/{tid}/mover", json={"status": "fazendo", "posicao": 0}).json()["status"] == "fazendo"
    assert c.post(f"/api/tarefas/{tid}/mover", json={"status": "nada"}).status_code == 422
    assert [t["id"] for t in c.get("/api/tarefas?responsavel=jullyana").json()] == [tid]
    assert c.get("/api/tarefas?responsavel=rayssa").json() == []
    assert c.get("/api/tarefas/resumo").json()["jullyana"]["abertas"] == 1
    # outra pessoa também mexe (o quadro é compartilhado)
    ju = cliente("jullyana", "senha-ju")
    assert ju.post(f"/api/tarefas/{tid}/mover", json={"status": "feito"}).status_code == 200
    assert c.delete(f"/api/tarefas/{tid}").status_code == 200
    assert c.delete(f"/api/tarefas/{tid}").status_code == 404
    assert c.put("/api/tarefas/9999", json={"titulo": "x"}).status_code == 404


def test_rotas_exigem_sessao_e_backup_inclui_tarefas(cliente):
    anon = TestClient(__import__("index").app, base_url="http://localhost")
    assert anon.get("/api/tarefas").status_code == 401 and anon.get("/api/usuarios").status_code == 401
    tarefas.criar({"titulo": "No backup"}, "dimi")
    assert backup.gerar()["contagem"]["tarefas"] == 1


def test_colunas_padrao_criar_renomear_e_ordenar(banco):
    assert [c["chave"] for c in tarefas.colunas()] == ["a_fazer", "fazendo", "bloqueada", "feito"]
    revisao = tarefas.criar_coluna("Em revisão")
    assert revisao["chave"] == "em_revisao" and revisao["ordem"] == 4 and revisao["concluida"] is False
    with pytest.raises(ValueError):
        tarefas.criar_coluna("em REVISÃO")  # nome repetido (sem diferenciar caixa)
    for ruim in ("", "  ", "x" * 31):
        with pytest.raises(ValueError):
            tarefas.criar_coluna(ruim)
    assert tarefas.editar_coluna("em_revisao", nome="Aguardando cliente")["nome"] == "Aguardando cliente"
    assert tarefas.editar_coluna("nao_existe", nome="x") is None
    ordem = tarefas.mover_coluna("em_revisao", 1)
    assert [c["chave"] for c in ordem] == ["a_fazer", "em_revisao", "fazendo", "bloqueada", "feito"]
    t = tarefas.criar({"titulo": "Cliente respondeu?"}, "dimi")
    assert tarefas.mover(t["id"], "em_revisao")["status"] == "em_revisao"
    tarefas.criar_coluna("Publicado", concluida=True)
    assert tarefas.mover(t["id"], "publicado")["concluida_em"] is not None


def test_excluir_coluna_move_as_tarefas(banco):
    extra = tarefas.criar_coluna("Ideias")
    t = tarefas.criar({"titulo": "Pensar nisso"}, "dimi")
    tarefas.mover(t["id"], extra["chave"])
    with pytest.raises(ValueError):
        tarefas.excluir_coluna("ideias")  # tem tarefa e não disse para onde vão
    assert tarefas.excluir_coluna("ideias", mover_para="a_fazer") is True
    assert tarefas.obter(t["id"])["status"] == "a_fazer"
    assert tarefas.excluir_coluna("ideias") is False
    for chave in ("fazendo", "bloqueada", "feito"):
        tarefas.excluir_coluna(chave)
    with pytest.raises(ValueError):
        tarefas.excluir_coluna("a_fazer")  # a última coluna fica


def test_limite_de_colunas(banco):
    for i in range(tarefas.COLUNAS_MAX - 4):
        tarefas.criar_coluna(f"Extra {i}")
    with pytest.raises(ValueError):
        tarefas.criar_coluna("Demais")


def test_tarefa_vinculada_a_documento_e_negocio(banco):
    from _orion import comercial, documentos

    doc = documentos.criar("Roteiro", "x", autor="dimi")
    org = comercial.criar_organizacao({"nome": "Clínica Sol", "tipo": "clinica"})
    neg = comercial.criar_negocio(org["id"], {"titulo": "Piloto Sol"}, "dimi")
    t = tarefas.criar({"titulo": "Revisar roteiro", "documento_id": doc["id"], "negocio_id": neg["id"]}, "dimi")
    assert (t["documento_titulo"], t["negocio_titulo"], t["organizacao_nome"]) == ("Roteiro", "Piloto Sol", "Clínica Sol")
    assert [x["id"] for x in tarefas.listar(negocio_id=neg["id"])] == [t["id"]]
    assert [x["id"] for x in tarefas.listar(documento_id=doc["id"])] == [t["id"]]
    assert tarefas.listar(negocio_id=99999) == []
    # relacionadas aparecem mesmo depois de concluídas há muito tempo
    tarefas.mover(t["id"], "feito")
    from _orion import db

    db.executar("update tarefas set concluida_em = now() - interval '30 days'")
    assert tarefas.listar() == [] and len(tarefas.listar(negocio_id=neg["id"])) == 1
    assert tarefas.editar(t["id"], {"negocio_id": None})["negocio_titulo"] is None
    with pytest.raises(ValueError):
        tarefas.criar({"titulo": "x", "documento_id": 99999}, "dimi")
    with pytest.raises(ValueError):
        tarefas.criar({"titulo": "x", "negocio_id": "abc"}, "dimi")
    # apagar o documento só solta o vínculo
    documentos_antes = tarefas.obter(t["id"])
    assert documentos_antes["documento_id"] == doc["id"]
    db.executar("delete from documentos where id = %s", (doc["id"],))
    assert tarefas.obter(t["id"])["documento_id"] is None


def test_rotas_de_colunas(cliente):
    c = cliente()
    assert [x["chave"] for x in c.get("/api/tarefas/colunas").json()][:2] == ["a_fazer", "fazendo"]
    r = c.post("/api/tarefas/colunas", json={"nome": "Em revisão"})
    assert r.status_code == 201 and r.json()["chave"] == "em_revisao"
    assert c.post("/api/tarefas/colunas", json={"nome": "em revisão"}).status_code == 422
    assert c.put("/api/tarefas/colunas/em_revisao", json={"nome": "Revisão", "concluida": False}).json()["nome"] == "Revisão"
    assert c.put("/api/tarefas/colunas/xyz", json={"nome": "A"}).status_code == 404
    mov = c.post("/api/tarefas/colunas/em_revisao/mover", json={"posicao": 0}).json()
    assert mov[0]["chave"] == "em_revisao"
    tid = c.post("/api/tarefas", json={"titulo": "Algo"}).json()["id"]
    c.post(f"/api/tarefas/{tid}/mover", json={"status": "em_revisao"})
    assert c.delete("/api/tarefas/colunas/em_revisao").status_code == 422
    assert c.delete("/api/tarefas/colunas/em_revisao?mover_para=fazendo").status_code == 200
    assert c.get("/api/tarefas?responsavel=dimi").json()[0]["status"] == "fazendo"
    assert c.delete("/api/tarefas/colunas/em_revisao").status_code == 404
