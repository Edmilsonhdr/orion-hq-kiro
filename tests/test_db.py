"""Testes de `_orion/db.py`.

A conexão real com o Postgres depende de banco local, que a fixture da task 2.3
ainda vai montar. Aqui testamos a lógica pura de `historico_recente`
(ordenação e formatação) substituindo `db.consultar` por um fake, sem rede.
"""

from _orion import db


def test_historico_recente_formata_e_ordena(monkeypatch):
    # `consultar` devolve as mais recentes primeiro (order by id desc);
    # `historico_recente` deve inverter para ordem cronológica.
    recentes_primeiro = [
        {"autor": "Orquestrador", "texto": "Já explico"},
        {"autor": "jullyana", "texto": "E o onboarding?"},
        {"autor": "dimi", "texto": "Oi"},
    ]
    monkeypatch.setattr(db, "consultar", lambda sql, params=None: list(recentes_primeiro))

    saida = db.historico_recente()

    assert saida == (
        "dimi: Oi\n"
        "jullyana: E o onboarding?\n"
        "Orquestrador: Já explico"
    )


def test_historico_recente_passa_limite(monkeypatch):
    capturado = {}

    def fake_consultar(sql, params=None):
        capturado["params"] = params
        return []

    monkeypatch.setattr(db, "consultar", fake_consultar)

    assert db.historico_recente(limite=5) == ""
    assert capturado["params"] == (5,)


def test_historico_recente_limite_padrao_12(monkeypatch):
    capturado = {}

    def fake_consultar(sql, params=None):
        capturado["params"] = params
        return []

    monkeypatch.setattr(db, "consultar", fake_consultar)

    db.historico_recente()
    assert capturado["params"] == (12,)


def test_historico_recente_vazio(monkeypatch):
    monkeypatch.setattr(db, "consultar", lambda sql, params=None: [])
    assert db.historico_recente() == ""
