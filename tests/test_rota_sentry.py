"""Testes da rota `POST /api/webhooks/sentry` (task 2.3 / Requirements 1.1, 1.2, 1.5).

Cobrem, com `TestClient` e sem tocar em serviços reais (Anthropic/GitHub/Sentry):

- Assinatura válida → 200 e o evento é encaminhado a `sentry.processar_evento`
  (substituído por um fake); assinatura inválida/ausente ou sem
  `SENTRY_CLIENT_SECRET` → 401 (Requirements 1.1, 1.2).
- Recurso desconhecido → 200 `{"ignorado": true}` (Requirement 1.5), sem chamar
  `processar_evento`.
- Ação fora de created/resolved/ignored e event_alert → 200 `{"ignorado": true}`
  (Requirement 1.5).
- Payload malformado (JSON inválido) → NUNCA 500; 200 `{"ignorado": true}`
  (design, "Error Handling": o Sentry reenviaria em loop).

Os testes que dependem do Postgres local (upsert de verdade) estão em
`test_sentry.py`; aqui o `processar_evento` é um fake, então esta suíte roda
sem banco.
"""

import hashlib
import hmac
import importlib
import json
import os

import pytest
from fastapi.testclient import TestClient

from _orion import sentry

_SESSION_SECRET = "segredo-de-sessao-bem-longo-para-hmac"
_CLIENT_SECRET = "segredo-da-integracao-do-sentry"
_PROJETOS = "orion-app:app,orion-api:backend"

_FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def _fixture_bytes(nome: str) -> bytes:
    with open(os.path.join(_FIXTURES, nome), "rb") as arq:
        return arq.read()


@pytest.fixture()
def cliente(monkeypatch):
    """Cliente HTTP de teste com o segredo da integração do Sentry configurado.

    Não usa banco: os testes que exercem o caminho "registrado" substituem
    `sentry.processar_evento` por um fake.
    """
    monkeypatch.setenv("ORION_SESSION_SECRET", _SESSION_SECRET)
    monkeypatch.setenv("SENTRY_CLIENT_SECRET", _CLIENT_SECRET)
    monkeypatch.setenv("ORION_SENTRY_PROJETOS", _PROJETOS)

    import index

    importlib.reload(index)
    return TestClient(index.app, base_url="http://localhost")


def _assinar(corpo: bytes, segredo: str = _CLIENT_SECRET) -> str:
    """HMAC-SHA256 hex do corpo bruto (como o Sentry manda no header)."""
    return hmac.new(segredo.encode("utf-8"), corpo, hashlib.sha256).hexdigest()


def _enviar(cliente, corpo, *, recurso="issue", assinar=True, assinatura=None):
    """Envia o webhook com o corpo BRUTO e os cabeçalhos do Sentry.

    `corpo` pode ser dict (serializado aqui) ou bytes (para testar malformado).
    """
    if isinstance(corpo, (bytes, bytearray)):
        bruto = bytes(corpo)
    else:
        bruto = json.dumps(corpo).encode("utf-8")

    cabecalhos = {"Content-Type": "application/json"}
    if recurso is not None:
        cabecalhos["Sentry-Hook-Resource"] = recurso
    if assinatura is not None:
        cabecalhos["Sentry-Hook-Signature"] = assinatura
    elif assinar:
        cabecalhos["Sentry-Hook-Signature"] = _assinar(bruto)
    return cliente.post("/api/webhooks/sentry", content=bruto, headers=cabecalhos)


# --- Assinatura (Requirements 1.1, 1.2) ---


def test_assinatura_valida_encaminha_para_processar(cliente, monkeypatch):
    """Corpo assinado → 200 e o evento chega a `processar_evento` (fake)."""
    chamado = {}

    def _fake_processar(campos):
        chamado["campos"] = campos
        return {"resultado": "registrado", "id": 42, "novo": True}

    monkeypatch.setattr(sentry, "processar_evento", _fake_processar)

    resp = _enviar(cliente, _fixture_bytes("sentry_issue_created.json"))
    assert resp.status_code == 200
    assert resp.json() == {"resultado": "registrado", "id": 42, "novo": True}
    # O parser aplicou a whitelist antes de chamar o processamento.
    assert chamado["campos"]["sentry_issue_id"] == "1234567890"
    assert chamado["campos"]["projeto"] == "app"


def test_assinatura_invalida_da_401(cliente, monkeypatch):
    def _nao_deve_chamar(campos):
        raise AssertionError("não deveria processar com assinatura inválida")

    monkeypatch.setattr(sentry, "processar_evento", _nao_deve_chamar)

    resp = _enviar(
        cliente, _fixture_bytes("sentry_issue_created.json"), assinatura="errada"
    )
    assert resp.status_code == 401


def test_sem_assinatura_da_401(cliente):
    resp = _enviar(cliente, _fixture_bytes("sentry_issue_created.json"), assinar=False)
    assert resp.status_code == 401


def test_sem_segredo_configurado_da_401(monkeypatch):
    """Sem `SENTRY_CLIENT_SECRET`, mesmo um HMAC "certo" → 401 (Requirement 1.2)."""
    monkeypatch.setenv("ORION_SESSION_SECRET", _SESSION_SECRET)
    monkeypatch.setenv("SENTRY_CLIENT_SECRET", "")
    monkeypatch.setenv("ORION_SENTRY_PROJETOS", _PROJETOS)

    import index

    importlib.reload(index)
    cli = TestClient(index.app, base_url="http://localhost")

    corpo = _fixture_bytes("sentry_issue_created.json")
    # Assina com um segredo qualquer; sem segredo no ambiente, tem de dar 401.
    resp = _enviar(cli, corpo, assinatura=_assinar(corpo, "qualquer-segredo"))
    assert resp.status_code == 401


# --- Ignorados (Requirement 1.5) ---


def test_recurso_desconhecido_e_ignorado(cliente, monkeypatch):
    """Recurso fora de issue/event_alert → 200 {"ignorado": true}, sem processar."""
    def _nao_deve_chamar(campos):
        raise AssertionError("recurso desconhecido não deveria ser processado")

    monkeypatch.setattr(sentry, "processar_evento", _nao_deve_chamar)

    resp = _enviar(
        cliente, _fixture_bytes("sentry_issue_created.json"), recurso="installation"
    )
    assert resp.status_code == 200
    assert resp.json() == {"ignorado": True}


def test_sem_recurso_e_ignorado(cliente):
    resp = _enviar(
        cliente, _fixture_bytes("sentry_issue_created.json"), recurso=None
    )
    assert resp.status_code == 200
    assert resp.json() == {"ignorado": True}


def test_acao_desconhecida_e_ignorada(cliente, monkeypatch):
    """`processar_evento` devolvendo `ignorado` vira 200 {"ignorado": true}."""
    monkeypatch.setattr(
        sentry, "processar_evento", lambda campos: {"resultado": "ignorado"}
    )
    resp = _enviar(cliente, _fixture_bytes("sentry_issue_created.json"))
    assert resp.status_code == 200
    assert resp.json() == {"ignorado": True}


def test_status_resolved_encaminha_resultado(cliente, monkeypatch):
    """`resolved` → 200 com o resultado de status (não vira {"ignorado"})."""
    monkeypatch.setattr(
        sentry,
        "processar_evento",
        lambda campos: {"resultado": "status", "id": 7, "status": "resolvido"},
    )
    resp = _enviar(cliente, _fixture_bytes("sentry_issue_resolved.json"))
    assert resp.status_code == 200
    assert resp.json() == {"resultado": "status", "id": 7, "status": "resolvido"}


# --- Payload malformado nunca dá 500 (design, "Error Handling") ---


def test_payload_malformado_nao_da_500(cliente, monkeypatch):
    """JSON inválido, mas assinado → 200 {"ignorado": true}, nunca 500."""
    def _nao_deve_chamar(campos):
        raise AssertionError("payload malformado não deveria ser processado")

    monkeypatch.setattr(sentry, "processar_evento", _nao_deve_chamar)

    resp = _enviar(cliente, b"isto nao e json {")
    assert resp.status_code == 200
    assert resp.json() == {"ignorado": True}


def test_payload_json_nao_objeto_e_ignorado(cliente, monkeypatch):
    """JSON válido mas não-objeto (ex.: lista) → 200 {"ignorado": true}."""
    def _nao_deve_chamar(campos):
        raise AssertionError("payload não-objeto não deveria ser processado")

    monkeypatch.setattr(sentry, "processar_evento", _nao_deve_chamar)

    resp = _enviar(cliente, b"[1, 2, 3]")
    assert resp.status_code == 200
    assert resp.json() == {"ignorado": True}
