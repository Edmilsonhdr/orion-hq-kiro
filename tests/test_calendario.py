"""Calendário: reúne prazos de tarefas, próximos passos do Comercial e reuniões (só leitura)."""

import importlib
from datetime import date

import pytest
from fastapi.testclient import TestClient

from _orion import calendario, comercial, db, tarefas

HOJE = date(2026, 11, 3)


@pytest.fixture()
def cliente(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi")
    import index

    importlib.reload(index)
    c = TestClient(index.app, base_url="http://localhost")
    c.post("/api/login", json={"usuario": "dimi", "senha": "senha-dimi"})
    return c


@pytest.fixture(autouse=True)
def usuarios(monkeypatch):
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi,jullyana:senha-ju")


@pytest.fixture()
def dados(banco):
    org = comercial.criar_organizacao({"nome": "Clínica Vida"})
    neg = comercial.criar_negocio(org["id"], {"titulo": "Piloto", "proximo_passo": "Ligar", "proximo_passo_em": "2026-11-05"}, "dimi")
    perdido = comercial.criar_negocio(org["id"], {"titulo": "Antigo", "proximo_passo": "x", "proximo_passo_em": "2026-11-05"}, "dimi")
    db.executar("update negocios set etapa = 'perdido' where id = %s", (perdido["id"],))
    aberta = tarefas.criar({"titulo": "Revisar proposta", "responsavel": "dimi", "prazo": "2026-11-04"}, "dimi")
    atrasada = tarefas.criar({"titulo": "Enviar contrato", "responsavel": "dimi", "prazo": "2026-11-01"}, "dimi")
    feita = tarefas.criar({"titulo": "Já feita", "responsavel": "dimi", "prazo": "2026-11-04"}, "dimi")
    tarefas.mover(feita["id"], "feito")
    db.executar(
        "insert into reunioes (titulo, inicio, fim, participantes) values "
        "('Demo', '2026-11-03T17:00:00Z', '2026-11-03T18:00:00Z', '{dimi,jullyana}'), "
        "('Madrugada UTC', '2026-11-04T01:30:00Z', '2026-11-04T02:00:00Z', '{}')"
    )
    return {"neg": neg, "aberta": aberta, "atrasada": atrasada, "feita": feita}


def test_itens_do_periodo_com_as_tres_fontes(dados):
    itens = calendario.itens(date(2026, 11, 1), date(2026, 11, 30))
    por_titulo = {i["titulo"]: i for i in itens}
    assert "Clínica Vida: Ligar" in por_titulo and "Antigo" not in str(itens)  # negócio perdido fica de fora
    assert por_titulo["Já feita"]["feito"] is True and por_titulo["Revisar proposta"]["feito"] is False
    demo = por_titulo["Demo"]
    assert (demo["data"], demo["hora"], demo["tipo"]) == ("2026-11-03", "14:00–15:00", "reuniao")  # horário de Brasília
    assert demo["ics"].endswith(".ics") and demo["detalhe"] == "dimi, jullyana"
    # 01:30 UTC ainda é dia 3 em Brasília (22:30)
    assert por_titulo["Madrugada UTC"]["data"] == "2026-11-03"
    assert [i["data"] for i in itens] == sorted(i["data"] for i in itens)


def test_intervalo_filtra_e_valida(dados):
    assert [i["titulo"] for i in calendario.itens(date(2026, 11, 5), date(2026, 11, 5))] == ["Clínica Vida: Ligar"]
    with pytest.raises(ValueError):
        calendario.itens(date(2026, 11, 5), date(2026, 11, 1))
    with pytest.raises(ValueError):
        calendario.itens(date(2026, 1, 1), date(2026, 12, 31))


def test_agenda_separa_atrasados_hoje_e_proximos(dados):
    ag = calendario.agenda(HOJE)
    assert [i["titulo"] for i in ag["atrasados"]] == ["Enviar contrato"]
    assert {i["titulo"] for i in ag["de_hoje"]} == {"Demo", "Madrugada UTC"}
    assert [i["titulo"] for i in ag["proximos"]] == ["Revisar proposta", "Clínica Vida: Ligar"]  # concluída não entra


def test_rotas(cliente, dados):
    r = cliente.get("/api/calendario?de=2026-11-01&ate=2026-11-30")
    assert r.status_code == 200 and len(r.json()) == 6
    assert cliente.get("/api/calendario?de=2026-11-05&ate=2026-11-01").status_code == 422
    assert cliente.get("/api/calendario?de=2026-01-01&ate=2026-12-31").status_code == 422
    assert cliente.get("/api/calendario?de=ontem&ate=hoje").status_code == 422
    assert set(cliente.get("/api/calendario/agenda").json()) == {"hoje", "atrasados", "de_hoje", "proximos"}


def test_rotas_exigem_sessao(banco, monkeypatch):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi")
    import index

    importlib.reload(index)
    anonimo = TestClient(index.app, base_url="http://localhost")
    assert anonimo.get("/api/calendario?de=2026-11-01&ate=2026-11-30").status_code == 401
    assert anonimo.get("/api/calendario/agenda").status_code == 401
