"""Testes de `_orion/comercial.py` (spec comercial, tarefas 2 a 4)."""

from datetime import timedelta

import pytest

from _orion import comercial, config, db


def _org(nome="Clínica Vida", **kw):
    return comercial.criar_organizacao({"nome": nome, **kw})


def _neg(org=None, titulo="Piloto", autor="jullyana", **kw):
    org = org or _org()
    return comercial.criar_negocio(org["id"], {"titulo": titulo, **kw}, autor)


# --- organizações e contatos ---


def test_criar_organizacao_com_padroes(banco):
    o = _org(tipo="autonomo", area="nutricao", cidade=" Recife ")
    assert o["tipo"] == "autonomo" and o["area"] == "nutricao" and o["cidade"] == "Recife"
    assert _org("Outra")["tipo"] == "clinica"


@pytest.mark.parametrize("campos", [
    {"nome": "  "}, {"nome": "x" * 201}, {"nome": "A", "tipo": "ong"}, {"nome": "A", "area": "x"},
])
def test_organizacao_invalida(banco, campos):
    with pytest.raises(ValueError):
        comercial.criar_organizacao(campos)


def test_nome_repetido_ignora_caixa_e_arquivada_libera(banco):
    o = _org("Clínica Vida")
    with pytest.raises(comercial.ConflitoError):
        _org("clínica vida")
    comercial.arquivar_organizacao(o["id"])
    outra = _org("clínica vida")
    with pytest.raises(comercial.ConflitoError):
        comercial.arquivar_organizacao(o["id"], False)
    assert outra["id"] != o["id"]


def test_listar_organizacoes_oculta_arquivadas_e_busca(banco):
    a = _org("Nutri Recife"); _org("Academia Força")
    comercial.arquivar_organizacao(a["id"])
    assert [o["nome"] for o in comercial.listar_organizacoes()] == ["Academia Força"]
    assert comercial.listar_organizacoes(arquivadas=True)[0]["nome"] == "Nutri Recife"
    assert comercial.listar_organizacoes(busca="academia forca")[0]["nome"] == "Academia Força"
    assert comercial.listar_organizacoes(busca="zzz") == []


def test_obter_ou_criar_organizacao(banco):
    a = comercial.obter_ou_criar_organizacao("Clínica X")
    assert comercial.obter_ou_criar_organizacao("clínica x")["id"] == a["id"]


def test_contatos_crud_e_email(banco):
    o = _org()
    c = comercial.criar_contato(o["id"], {"nome": "Ana", "email": "ana@x.com"})
    assert comercial.editar_contato(c["id"], {"cargo": "Sócia"})["cargo"] == "Sócia"
    with pytest.raises(ValueError):
        comercial.criar_contato(o["id"], {"nome": "Bia", "email": "invalido"})
    with pytest.raises(ValueError):
        comercial.criar_contato(o["id"], {"nome": ""})
    assert comercial.criar_contato(9999, {"nome": "Zé"}) is None
    assert comercial.obter_organizacao(o["id"])["contatos"][0]["nome"] == "Ana"
    assert comercial.excluir_contato(c["id"]) and not comercial.excluir_contato(c["id"])


# --- negócios ---


def test_criar_negocio_padroes(banco):
    n = _neg(valor_mensal="149.9", pacientes_ativos=30, plano_interesse="completo",
             usa_hoje="Dietbox")
    assert n["etapa"] == "lead" and n["responsavel"] == "jullyana"
    assert n["valor_mensal"] == 149.9 and n["organizacao_nome"] == "Clínica Vida"


@pytest.mark.parametrize("campos", [
    {"valor_mensal": -1}, {"valor_mensal": "abc"}, {"pacientes_ativos": -2},
    {"pacientes_ativos": "x"}, {"plano_interesse": "ouro"}, {"etapa": "ganho"},
    {"proximo_passo_em": "amanhã"}, {"titulo": ""},
])
def test_negocio_invalido(banco, campos):
    org = _org()
    with pytest.raises(ValueError):
        comercial.criar_negocio(org["id"], {"titulo": "T", **campos}, "j")


def test_negocio_em_organizacao_inexistente_ou_arquivada(banco):
    assert comercial.criar_negocio(999, {"titulo": "T"}, "j") is None
    o = _org(); comercial.arquivar_organizacao(o["id"])
    assert comercial.criar_negocio(o["id"], {"titulo": "T"}, "j") is None


def test_editar_negocio(banco):
    n = _neg()
    e = comercial.editar_negocio(n["id"], {"proximo_passo": "Ligar", "proximo_passo_em": "2026-11-05"})
    assert e["proximo_passo"] == "Ligar" and str(e["proximo_passo_em"]) == "2026-11-05"
    assert comercial.editar_negocio(999, {"titulo": "x"}) is None


def test_mover_etapa_registra_historico(banco):
    n = _neg()
    m = comercial.mover_etapa(n["id"], "demonstracao", "dimi")
    assert m["etapa"] == "demonstracao" and m["fechado_em"] is None
    h = comercial.listar_interacoes(n["id"])
    assert h[0]["tipo"] == "etapa" and "Lead → Demonstração" in h[0]["resumo"] and h[0]["autor"] == "dimi"
    comercial.mover_etapa(n["id"], "demonstracao", "dimi")  # sem mudança
    assert len(comercial.listar_interacoes(n["id"])) == 1


def test_perdido_exige_motivo_e_reabrir_limpa(banco):
    n = _neg()
    with pytest.raises(ValueError):
        comercial.mover_etapa(n["id"], "perdido", "dimi")
    p = comercial.mover_etapa(n["id"], "perdido", "dimi", "Sem orçamento")
    assert p["motivo_perda"] == "Sem orçamento" and p["fechado_em"]
    r = comercial.mover_etapa(n["id"], "contato", "dimi")
    assert r["motivo_perda"] is None and r["fechado_em"] is None
    g = comercial.mover_etapa(n["id"], "ganho", "dimi")
    assert g["fechado_em"] and g["motivo_perda"] is None
    with pytest.raises(ValueError):
        comercial.mover_etapa(n["id"], "xyz", "dimi")
    assert comercial.mover_etapa(999, "lead", "dimi") is None


def test_listar_negocios_filtros_e_fechados_antigos(banco):
    a = _neg(titulo="Piloto Nutri", responsavel="dimi", proximo_passo="Enviar proposta")
    b = _neg(_org("Academia"), "Treinos")
    comercial.mover_etapa(b["id"], "ganho", "j")
    velho = _neg(_org("Antiga"), "Velho")
    comercial.mover_etapa(velho["id"], "ganho", "j")
    db.executar("update negocios set fechado_em = now() - interval '40 days' where id = %s", (velho["id"],))
    ids = {n["id"] for n in comercial.listar_negocios()}
    assert ids == {a["id"], b["id"]}
    assert velho["id"] in {n["id"] for n in comercial.listar_negocios(todos=True)}
    assert [n["id"] for n in comercial.listar_negocios(etapa="lead")] == [a["id"]]
    assert [n["id"] for n in comercial.listar_negocios(responsavel="dimi")] == [a["id"]]
    assert [n["id"] for n in comercial.listar_negocios(busca="propostas")] == [a["id"]]
    assert [n["id"] for n in comercial.listar_negocios(busca="clinica vida")] == [a["id"]]
    with pytest.raises(ValueError):
        comercial.listar_negocios(etapa="xyz")


# --- interações ---


def test_interacoes(banco):
    n = _neg()
    db.executar("update negocios set atualizado_em = now() - interval '20 days' where id = %s", (n["id"],))
    assert comercial.parados()[0]["id"] == n["id"]
    i = comercial.registrar_interacao(n["id"], "ligacao", " Falei com a Ana ", "jullyana")
    assert i["resumo"] == "Falei com a Ana"
    assert comercial.parados() == []
    with pytest.raises(ValueError):
        comercial.registrar_interacao(n["id"], "sms", "x", "j")
    with pytest.raises(ValueError):
        comercial.registrar_interacao(n["id"], "nota", " ", "j")
    assert comercial.registrar_interacao(999, "nota", "x", "j") is None
    comercial.mover_etapa(n["id"], "contato", "j")
    sistema = next(x for x in comercial.listar_interacoes(n["id"]) if x["tipo"] == "etapa")
    assert comercial.excluir_interacao(sistema["id"]) == "do_sistema"
    assert comercial.excluir_interacao(i["id"]) == "ok"
    assert comercial.excluir_interacao(i["id"]) == "nao_encontrada"


# --- visões ---


def test_hoje_agrupa_por_data(banco):
    dia = comercial.hoje_data()
    v = _neg(titulo="V", proximo_passo_em=dia - timedelta(days=2))
    h = _neg(_org("B"), "H", proximo_passo_em=dia)
    p = _neg(_org("C"), "P", proximo_passo_em=dia + timedelta(days=7))
    longe = _neg(_org("D"), "L", proximo_passo_em=dia + timedelta(days=8))
    s = _neg(_org("E"), "S")
    g = comercial.hoje()
    assert [n["id"] for n in g["vencidos"]] == [v["id"]]
    assert [n["id"] for n in g["hoje"]] == [h["id"]]
    assert [n["id"] for n in g["proximos"]] == [p["id"]]
    assert [n["id"] for n in g["sem_passo"]] == [s["id"]]
    assert longe["id"] not in {n["id"] for k in g.values() for n in k}


def test_resumo_funil(banco):
    assert comercial.resumo_funil()["conversao_90d"] is None
    assert comercial.texto_resumo_semanal() is None
    dia = comercial.hoje_data()
    _neg(valor_mensal=100, proximo_passo_em=dia - timedelta(days=1))
    n2 = _neg(_org("B"), "T2", valor_mensal=50)
    comercial.mover_etapa(n2["id"], "piloto", "j")
    g = _neg(_org("C"), "T3"); comercial.mover_etapa(g["id"], "ganho", "j")
    p = _neg(_org("D"), "T4"); comercial.mover_etapa(p["id"], "perdido", "j", "Preço")
    r = comercial.resumo_funil()
    assert r["abertos"] == 2 and r["valor_mensal_potencial"] == 150
    assert r["por_etapa"]["lead"] == {"quantidade": 1, "valor_mensal": 100}
    assert r["por_etapa"]["piloto"]["quantidade"] == 1
    assert (r["ganhos_30d"], r["perdidos_30d"], r["vencidos"], r["sem_passo"]) == (1, 1, 1, 1)
    assert r["conversao_90d"] == 0.5
    t = comercial.texto_resumo_semanal()
    assert "abertos: 2" in t and "R$ 150,00" in t and "1 ganho(s)" in t
