"""Testes do resumo semanal (task 8.2 / Requirement 10).

Cobrem, com `TestClient` e modelo simulado:

- Autenticação por Bearer `CRON_SECRET`: segredo certo → 200 e posta o resumo;
  ausente/errado → 401 (Requirement 10.2).
- Com mudanças na semana: chama o worker (fake) e posta a mensagem do
  Orquestrador (Requirement 10.1).
- Sem mudanças na semana: posta a linha única de "sem mudanças" sem chamar o
  modelo (Requirement 10.3).

Nenhum teste chama a Anthropic: `_redigir_resumo` é substituído por um fake.
"""

import importlib

import pytest
from fastapi.testclient import TestClient

from _orion import db, resumo

_SEGREDO = "segredo-de-teste-bem-longo-para-hmac"
_CRON_SECRET = "segredo-do-cron-da-vercel"


@pytest.fixture()
def cliente(monkeypatch, banco):
    """Cliente HTTP de teste com o CRON_SECRET configurado e banco limpo."""
    monkeypatch.setenv("ORION_SESSION_SECRET", _SEGREDO)
    monkeypatch.setenv("CRON_SECRET", _CRON_SECRET)

    import index

    importlib.reload(index)
    return TestClient(index.app, base_url="http://localhost")


def _inserir_mudanca(titulo, resumo_texto):
    """Insere um item recente no changelog (dentro da janela de 7 dias)."""
    db.executar(
        """
        insert into changelog (fonte, referencia, titulo, resumo)
        values ('github', %s, %s, %s)
        """,
        (f"PR #{titulo}", titulo, resumo_texto),
    )


# --- Autenticação (Requirement 10.2) ---


def test_sem_authorization_da_401(cliente):
    assert cliente.get("/api/cron/resumo-semanal").status_code == 401


def test_bearer_errado_da_401(cliente):
    resp = cliente.get(
        "/api/cron/resumo-semanal",
        headers={"Authorization": "Bearer segredo-errado"},
    )
    assert resp.status_code == 401


def test_sem_prefixo_bearer_da_401(cliente):
    resp = cliente.get(
        "/api/cron/resumo-semanal",
        headers={"Authorization": _CRON_SECRET},
    )
    assert resp.status_code == 401


# --- Geração do resumo ---


def test_com_mudancas_posta_resumo(cliente, monkeypatch):
    _inserir_mudanca("Onboarding", "Novo fluxo de onboarding.")
    monkeypatch.setattr(
        resumo, "_redigir_resumo", lambda contexto: "Resumo da semana: tudo certo."
    )

    resp = cliente.get(
        "/api/cron/resumo-semanal",
        headers={"Authorization": f"Bearer {_CRON_SECRET}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "resumido"

    msgs = db.consultar("select autor, texto from mensagens")
    assert len(msgs) == 1
    assert msgs[0]["autor"] == "Orquestrador"
    assert msgs[0]["texto"] == "Resumo da semana: tudo certo."


def test_sem_mudancas_posta_linha_unica_sem_modelo(cliente, monkeypatch):
    # Se o modelo for chamado, o teste falha (não deve haver chamada).
    def _nao_chamar(contexto):
        raise AssertionError("não deveria chamar o modelo sem mudanças")

    monkeypatch.setattr(resumo, "_redigir_resumo", _nao_chamar)

    resp = cliente.get(
        "/api/cron/resumo-semanal",
        headers={"Authorization": f"Bearer {_CRON_SECRET}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "sem_mudancas"

    msgs = db.consultar("select autor, texto from mensagens")
    assert len(msgs) == 1
    assert msgs[0]["autor"] == "Orquestrador"
    assert "nenhuma mudança" in msgs[0]["texto"].lower()
