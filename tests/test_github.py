"""Testes do webhook do GitHub (task 8.1 / Requirement 5).

Cobrem, com `TestClient` e sem chamar a Anthropic nem o GitHub de verdade:

- Assinatura válida vs inválida: corpo assinado com o segredo → processa (200);
  assinatura errada/ausente → 401 (Requirement 5.2).
- Evento ignorado: PR não mergeado, `action` diferente de `closed`, ou evento
  que não é `pull_request` → 200 `{"ignorado": true}` (Requirement 5.7).
- Upsert sem duplicar: o mesmo PR chegando duas vezes gera UMA linha no
  changelog, com o conteúdo atualizado (Requirement 5.3).

`_buscar_arquivos` (httpx) e `_resumir` (worker) são substituídos por fakes.
"""

import hashlib
import hmac
import importlib
import json

import pytest
from fastapi.testclient import TestClient

from _orion import db, github

_SEGREDO = "segredo-de-teste-bem-longo-para-hmac"
_WEBHOOK_SECRET = "segredo-do-webhook-do-github"


@pytest.fixture()
def cliente(monkeypatch, banco):
    """Cliente HTTP de teste com o segredo do webhook configurado e banco limpo."""
    monkeypatch.setenv("ORION_SESSION_SECRET", _SEGREDO)
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", _WEBHOOK_SECRET)

    import index

    importlib.reload(index)
    return TestClient(index.app, base_url="http://localhost")


@pytest.fixture(autouse=True)
def _sem_rede(monkeypatch):
    """Substitui a busca de arquivos (httpx) e o resumo (worker) por fakes.

    Nenhum teste toca no GitHub nem na Anthropic.
    """
    monkeypatch.setattr(
        github, "_buscar_arquivos",
        lambda pr_url: [{"filename": "app/api.py", "patch": "@@ +1 @@\n+print()"}],
    )
    monkeypatch.setattr(github, "_resumir", lambda texto_pr: "Resumo gerado do PR.")


def _assinar(corpo: bytes, segredo: str = _WEBHOOK_SECRET) -> str:
    """Calcula o cabeçalho `sha256=<hmac>` para um corpo bruto."""
    mac = hmac.new(segredo.encode("utf-8"), corpo, hashlib.sha256).hexdigest()
    return f"sha256={mac}"


def _corpo_pr_mergeado(numero=12, titulo="Onboarding novo", merged=True,
                       action="closed"):
    """Payload de webhook `pull_request` (mergeado por padrão)."""
    return {
        "action": action,
        "pull_request": {
            "number": numero,
            "title": titulo,
            "body": "Descrição do PR.",
            "merged": merged,
            "url": "https://api.github.com/repos/orion/orion/pulls/%d" % numero,
            "html_url": "https://github.com/orion/orion/pull/%d" % numero,
            "user": {"login": "dimi"},
        },
    }


def _enviar(cliente, corpo_dict, *, evento="pull_request", assinar=True,
            assinatura=None):
    """Envia o webhook com o corpo BRUTO e os cabeçalhos apropriados."""
    corpo = json.dumps(corpo_dict).encode("utf-8")
    cabecalhos = {
        "Content-Type": "application/json",
        "X-GitHub-Event": evento,
    }
    if assinatura is not None:
        cabecalhos["X-Hub-Signature-256"] = assinatura
    elif assinar:
        cabecalhos["X-Hub-Signature-256"] = _assinar(corpo)
    return cliente.post("/api/webhooks/github", content=corpo, headers=cabecalhos)


# --- Assinatura ---


def test_assinatura_valida_processa(cliente):
    resp = _enviar(cliente, _corpo_pr_mergeado())
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "pr": 12}

    # O resumo foi gravado no changelog.
    linhas = db.consultar("select fonte, referencia, titulo, resumo from changelog")
    assert len(linhas) == 1
    assert linhas[0]["fonte"] == "github"
    assert linhas[0]["referencia"] == "PR #12"
    assert linhas[0]["resumo"] == "Resumo gerado do PR."

    # E o Orquestrador avisou no chat (Requirement 5.5).
    msgs = db.consultar("select autor, texto from mensagens")
    assert len(msgs) == 1
    assert msgs[0]["autor"] == "Orquestrador"
    assert msgs[0]["texto"] == "Novo no Orion: PR #12 — Onboarding novo"


def test_assinatura_invalida_da_401(cliente):
    resp = _enviar(cliente, _corpo_pr_mergeado(), assinatura="sha256=errado")
    assert resp.status_code == 401
    # Nada foi gravado.
    assert db.consultar("select id from changelog") == []


def test_sem_assinatura_da_401(cliente):
    resp = _enviar(cliente, _corpo_pr_mergeado(), assinar=False)
    assert resp.status_code == 401


# --- Eventos ignorados (Requirement 5.7) ---


def test_pr_nao_mergeado_e_ignorado(cliente):
    resp = _enviar(cliente, _corpo_pr_mergeado(merged=False))
    assert resp.status_code == 200
    assert resp.json() == {"ignorado": True}
    assert db.consultar("select id from changelog") == []


def test_action_diferente_de_closed_e_ignorada(cliente):
    resp = _enviar(cliente, _corpo_pr_mergeado(action="opened"))
    assert resp.status_code == 200
    assert resp.json() == {"ignorado": True}


def test_evento_diferente_de_pull_request_e_ignorado(cliente):
    resp = _enviar(cliente, _corpo_pr_mergeado(), evento="push")
    assert resp.status_code == 200
    assert resp.json() == {"ignorado": True}


# --- Upsert sem duplicar (Requirement 5.3) ---


def test_mesmo_pr_duas_vezes_nao_duplica(cliente, monkeypatch):
    # Primeira entrega.
    resp1 = _enviar(cliente, _corpo_pr_mergeado(numero=30, titulo="Título antigo"))
    assert resp1.status_code == 200

    # Reentrega do MESMO PR, com título/resumo atualizados.
    monkeypatch.setattr(github, "_resumir", lambda texto_pr: "Resumo atualizado.")
    resp2 = _enviar(cliente, _corpo_pr_mergeado(numero=30, titulo="Título novo"))
    assert resp2.status_code == 200

    # Uma única linha no changelog para o PR #30, com o conteúdo atualizado.
    linhas = db.consultar(
        "select titulo, resumo from changelog where referencia = 'PR #30'"
    )
    assert len(linhas) == 1
    assert linhas[0]["titulo"] == "Título novo"
    assert linhas[0]["resumo"] == "Resumo atualizado."
