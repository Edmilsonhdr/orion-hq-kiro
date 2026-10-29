"""Testes das ferramentas e propostas do Comercial (spec comercial, tarefas 6 e 7)."""

import pytest

from _orion import comercial, db, execucao, ferramentas
from _orion import propostas_comercial as pc


def _org(nome="Clínica Vida"):
    return comercial.criar_organizacao({"nome": nome})


def _neg(titulo="Piloto", org=None, **kw):
    org = org or _org()
    return comercial.criar_negocio(org["id"], {"titulo": titulo, **kw}, "jullyana")


def _id(texto):
    return int(texto.split("#", 1)[1].split(")", 1)[0])


def _ap(i):
    return db.um("select * from aprovacoes where id = %s", (i,))


def _chat():
    return db.um("select autor, texto from mensagens order by id desc limit 1")


# --- leitura ---


def test_leitura_sem_dados(banco):
    assert "Não há negócios" in ferramentas._resumo_funil()
    assert ferramentas._buscar_negocios("x") == "Nenhum negócio encontrado."
    assert "Nenhum negócio aberto parado" in ferramentas._negocios_parados()
    assert "Não há negócios abertos" in ferramentas._agenda_comercial()
    assert "Não existe negócio" in ferramentas._ver_negocio(9)
    assert "id" in ferramentas._ver_negocio("abc")


def test_leitura_com_dados(banco):
    n = _neg(valor_mensal=149, pacientes_ativos=30, plano_interesse="completo", usa_hoje="Dietbox")
    comercial.criar_contato(n["organizacao_id"], {"nome": "Ana", "cargo": "Sócia"})
    comercial.registrar_interacao(n["id"], "ligacao", "Falei com a Ana", "jullyana")
    assert "1 negócios abertos" in ferramentas._resumo_funil() or "1 negócio" in ferramentas._resumo_funil()
    busca = ferramentas._buscar_negocios("piloto")
    assert f"#{n['id']}" in busca and "R$ 149,00" in busca and "Dietbox" in busca
    ver = ferramentas._ver_negocio(n["id"])
    assert "Ana (Sócia)" in ver and "Falei com a Ana" in ver
    assert "etapa inválida" in ferramentas._buscar_negocios("", "xx").lower() or "inválid" in ferramentas._buscar_negocios("", "xx")
    db.executar("update negocios set atualizado_em = now() - interval '10 days'")
    assert "parado há 10 dias" in ferramentas._negocios_parados()
    assert "Sem próximo passo" in ferramentas._agenda_comercial()


# --- propor ---


def test_propor_novo_negocio_nao_grava(banco):
    t = pc.propor_novo_negocio("negocios", "run-1", "Nutri Ana", "Piloto Ana", "autonomo",
                               valor_mensal=49, proximo_passo_em="2026-11-10")
    assert "PROPOSTA" in t
    assert db.um("select count(*) as n from negocios")["n"] == 0
    ap = _ap(_id(t))
    assert ap["tipo"] == pc.TIPO_NOVO and ap["status"] == "pendente" and ap["pedido_por"] == "negocios"
    assert ap["proposta"]["campos"]["valor_mensal"] == 49.0


def test_propostas_invalidas(banco):
    n = _neg()
    assert "recusada" in pc.propor_novo_negocio("negocios", "r", "", "T")
    assert "recusada" in pc.propor_novo_negocio("negocios", "r", "A", "T", "ong")
    assert "recusada" in pc.propor_novo_negocio("negocios", "r", "A", "T", valor_mensal=-1)
    assert "recusada" in pc.propor_atualizacao("negocios", "r", 999, "contato")
    assert "recusada" in pc.propor_atualizacao("negocios", "r", n["id"], "xx")
    assert "motivo" in pc.propor_atualizacao("negocios", "r", n["id"], "perdido")
    assert "nenhuma mudança" in pc.propor_atualizacao("negocios", "r", n["id"], "lead")
    assert "recusada" in pc.propor_interacao("negocios", "r", n["id"], "sms", "x")
    assert "recusada" in pc.propor_interacao("negocios", "r", 999, "nota", "x")
    assert "não há um pedido" in pc.propor_novo_negocio("negocios", None, "A", "T")
    assert db.um("select count(*) as n from aprovacoes")["n"] == 0


def test_proposta_em_negocio_fechado_recusada(banco):
    n = _neg(); comercial.mover_etapa(n["id"], "ganho", "j")
    assert "fechado" in pc.propor_atualizacao("negocios", "r", n["id"], "contato")


def test_limite_por_run(banco):
    n = _neg()
    for _ in range(pc.LIMITE_POR_RUN):
        assert "PROPOSTA" in pc.propor_interacao("negocios", "run-x", n["id"], "nota", "oi")
    assert "Limite" in pc.propor_interacao("negocios", "run-x", n["id"], "nota", "oi")
    assert "PROPOSTA" in pc.propor_interacao("negocios", "run-y", n["id"], "nota", "oi")


def test_ferramentas_usam_contexto_e_estao_no_negocios(banco):
    n = _neg()
    token = ferramentas.contexto.set(("negocios", "run-ctx"))
    try:
        t = ferramentas.propor_interacao.invoke({"negocio_id": n["id"], "tipo": "nota", "resumo": "Oi"})
    finally:
        ferramentas.contexto.reset(token)
    assert _ap(_id(t))["run_id"] == "run-ctx"
    nomes = {f.name for f in ferramentas.FERRAMENTAS_NEGOCIOS}
    assert {"resumo_funil", "buscar_negocios", "ver_negocio", "negocios_parados",
            "agenda_comercial", "propor_novo_negocio", "propor_atualizacao_negocio",
            "propor_interacao"} <= nomes
    assert "propor_novo_negocio" not in {f.name for f in ferramentas.FERRAMENTAS_TECH}


# --- decidir ---


def test_aprovar_novo_negocio_aplica_e_avisa(banco):
    t = pc.propor_novo_negocio("negocios", "run-1", "Nutri Ana", "Piloto Ana", "autonomo", valor_mensal=49)
    r = execucao.decidir_aprovacao(_id(t), "dimi", True)
    assert r["status"] == "respondido"
    n = comercial.listar_negocios()[0]
    assert n["titulo"] == "Piloto Ana" and n["organizacao_tipo"] == "autonomo" and n["responsavel"] == "dimi"
    assert _chat()["autor"] == "Orquestrador" and "Piloto Ana" in _chat()["texto"]
    assert _ap(_id(t))["status"] == "aprovada"


def test_recusar_nao_grava(banco):
    t = pc.propor_novo_negocio("negocios", "run-1", "Nutri Ana", "Piloto Ana")
    execucao.decidir_aprovacao(_id(t), "dimi", False)
    assert db.um("select count(*) as n from negocios")["n"] == 0
    assert "recusou" in _chat()["texto"]


def test_aprovar_atualizacao_move_etapa_com_autoria(banco):
    n = _neg()
    t = pc.propor_atualizacao("negocios", "run-2", n["id"], "demonstracao", proximo_passo="Enviar convite")
    execucao.decidir_aprovacao(_id(t), "jullyana", True)
    atual = comercial.obter_negocio(n["id"])
    assert atual["etapa"] == "demonstracao" and atual["proximo_passo"] == "Enviar convite"
    h = comercial.listar_interacoes(n["id"])[0]
    assert h["autor"] == "negocios (aprovado por jullyana)"


def test_aprovar_interacao(banco):
    n = _neg()
    t = pc.propor_interacao("negocios", "run-3", n["id"], "ligacao", "Liguei, retorno sexta")
    execucao.decidir_aprovacao(_id(t), "dimi", True)
    i = comercial.listar_interacoes(n["id"])[0]
    assert i["resumo"] == "Liguei, retorno sexta" and "aprovado por dimi" in i["autor"]


def test_obsoleta_se_etapa_mudou_ou_fechou(banco):
    n = _neg()
    t = pc.propor_atualizacao("negocios", "run-4", n["id"], "proposta")
    comercial.mover_etapa(n["id"], "contato", "j")
    execucao.decidir_aprovacao(_id(t), "dimi", True)
    assert _ap(_id(t))["status"] == "obsoleta"
    assert comercial.obter_negocio(n["id"])["etapa"] == "contato"
    assert "etapa mudou" in _chat()["texto"]

    t2 = pc.propor_interacao("negocios", "run-5", n["id"], "nota", "x")
    db.executar("delete from negocios where id = %s", (n["id"],))
    execucao.decidir_aprovacao(_id(t2), "dimi", True)
    assert _ap(_id(t2))["status"] == "obsoleta"


def test_falha_vira_erro_e_retry_nao_duplica(banco, monkeypatch):
    t = pc.propor_novo_negocio("negocios", "run-6", "Nutri Ana", "Piloto Ana")
    original = comercial.criar_negocio
    chamadas = {"n": 0}

    def quebra(*a, **k):
        chamadas["n"] += 1
        raise RuntimeError("banco fora")

    monkeypatch.setattr(comercial, "criar_negocio", quebra)
    execucao.decidir_aprovacao(_id(t), "dimi", True)
    assert _ap(_id(t))["status"] == "erro"
    monkeypatch.setattr(comercial, "criar_negocio", original)
    execucao.retomar_aprovacao(_id(t))
    execucao.retomar_aprovacao(_id(t))  # segunda tentativa: não está mais em erro
    assert db.um("select count(*) as n from negocios")["n"] == 1
    # Reaplicar direto não duplica (marcador de idempotência).
    pc.aplicar(_ap(_id(t)), "dimi")
    assert db.um("select count(*) as n from negocios")["n"] == 1
