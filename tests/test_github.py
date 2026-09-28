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

# Guardados antes dos fakes autouse, para testar as funções reais.
_RESUMIR_ORIGINAL = github._resumir
_BUSCAR_ORIGINAL = github._buscar_arquivos


@pytest.fixture()
def cliente(monkeypatch, banco):
    """Cliente HTTP de teste com o segredo do webhook configurado e banco limpo."""
    monkeypatch.setenv("ORION_SESSION_SECRET", _SEGREDO)
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", _WEBHOOK_SECRET)
    monkeypatch.setenv("GITHUB_TOKEN", "token-de-teste")

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
        lambda pr_url, token: [{"filename": "app/api.py", "patch": "@@ +1 @@\n+print()"}],
    )
    monkeypatch.setattr(
        github, "_resumir", lambda texto_pr, run_id=None: "Resumo gerado do PR."
    )


def _assinar(corpo: bytes, segredo: str = _WEBHOOK_SECRET) -> str:
    """Calcula o cabeçalho `sha256=<hmac>` para um corpo bruto."""
    mac = hmac.new(segredo.encode("utf-8"), corpo, hashlib.sha256).hexdigest()
    return f"sha256={mac}"


def _corpo_pr_mergeado(numero=12, titulo="Onboarding novo", merged=True,
                       action="closed", repo="orion/orion-back"):
    """Payload de webhook `pull_request` (mergeado por padrão)."""
    return {
        "action": action,
        "repository": {"full_name": repo, "owner": {"login": repo.split("/")[0]}},
        "pull_request": {
            "number": numero,
            "title": titulo,
            "body": "Descrição do PR.",
            "merged": merged,
            "url": f"https://api.github.com/repos/{repo}/pulls/{numero}",
            "html_url": f"https://github.com/{repo}/pull/{numero}",
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
    assert linhas[0]["referencia"] == "orion/orion-back PR #12"
    assert linhas[0]["resumo"] == "Resumo gerado do PR."

    # E o Orquestrador avisou no chat (Requirement 5.5).
    msgs = db.consultar("select autor, texto from mensagens")
    assert len(msgs) == 1
    assert msgs[0]["autor"] == "Orquestrador"
    assert msgs[0]["texto"] == "Novo no Orion: orion/orion-back PR #12 — Onboarding novo"


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

    # Reentrega do MESMO PR: não resume de novo nem reposta no chat.
    def _nao_resumir(texto_pr, run_id=None):
        raise AssertionError("não deveria resumir de novo")

    monkeypatch.setattr(github, "_resumir", _nao_resumir)
    resp2 = _enviar(cliente, _corpo_pr_mergeado(numero=30, titulo="Título novo"))
    assert resp2.status_code == 200
    assert resp2.json() == {"ok": True, "pr": 30, "duplicado": True}

    linhas = db.consultar(
        "select titulo, resumo from changelog where referencia = 'orion/orion-back PR #30'"
    )
    assert len(linhas) == 1
    assert linhas[0]["titulo"] == "Título antigo"
    assert linhas[0]["resumo"] == "Resumo gerado do PR."
    assert len(db.consultar("select id from mensagens")) == 1


# --- Falhas e configuração ---


def test_sem_github_token_responde_200_com_aviso(cliente, monkeypatch):
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)

    resp = _enviar(cliente, _corpo_pr_mergeado())
    assert resp.status_code == 200
    assert resp.json() == {"ok": False, "pr": 12, "aviso": github.AVISO_SEM_TOKEN}
    assert db.consultar("select id from changelog") == []
    assert db.consultar("select id from mensagens") == []


def test_falha_vira_atividade_erro_do_work(cliente, monkeypatch):
    from _orion import atividades

    def _quebrar(pr_url, token):
        raise RuntimeError("GitHub fora do ar")

    monkeypatch.setattr(github, "_buscar_arquivos", _quebrar)

    resp = _enviar(cliente, _corpo_pr_mergeado())
    assert resp.status_code == 502
    assert "GitHub fora do ar" not in resp.text
    erros = [
        a for a in atividades.listar()
        if a["agente"] == "work" and a["tipo"] == "erro"
    ]
    assert len(erros) == 1
    assert erros[0]["run_id"] == "gh-orion/orion-back-12"
    assert db.consultar("select id from changelog") == []


# --- Dois repositórios (front e back, donos diferentes) ---


def test_mesmo_numero_em_repos_diferentes_nao_se_confundem(cliente):
    resp1 = _enviar(cliente, _corpo_pr_mergeado(numero=5, repo="orion/orion-back"))
    resp2 = _enviar(cliente, _corpo_pr_mergeado(numero=5, repo="dimi/orion-front"))
    assert resp1.json() == {"ok": True, "pr": 5}
    assert resp2.json() == {"ok": True, "pr": 5}

    referencias = [
        linha["referencia"]
        for linha in db.consultar("select referencia from changelog order by id")
    ]
    assert referencias == ["orion/orion-back PR #5", "dimi/orion-front PR #5"]
    assert len(db.consultar("select id from mensagens")) == 2


def test_token_escolhido_pelo_dono_do_repo(cliente, monkeypatch):
    monkeypatch.setenv("GITHUB_TOKEN", "token-perfil")
    monkeypatch.setenv("GITHUB_TOKEN_MINHA_ORG", "token-org")
    usados = []

    def _buscar(pr_url, token):
        usados.append(token)
        return []

    monkeypatch.setattr(github, "_buscar_arquivos", _buscar)

    _enviar(cliente, _corpo_pr_mergeado(numero=1, repo="minha-org/orion-back"))
    _enviar(cliente, _corpo_pr_mergeado(numero=1, repo="dimi/orion-front"))
    assert usados == ["token-org", "token-perfil"]


# --- Paginação dos arquivos ---


class _RespostaFake:
    def __init__(self, dados):
        self._dados = dados

    def raise_for_status(self):
        pass

    def json(self):
        return self._dados


def test_buscar_arquivos_pagina_ate_pagina_incompleta(monkeypatch):
    import httpx

    paginas_pedidas = []

    def _get(url, headers, params, timeout):
        paginas_pedidas.append(params["page"])
        quantidade = 100 if params["page"] < 3 else 5
        return _RespostaFake(
            [{"filename": f"f{params['page']}-{i}", "patch": "+x"} for i in range(quantidade)]
        )

    monkeypatch.setattr(httpx, "get", _get)

    arquivos = _BUSCAR_ORIGINAL("https://api.github.com/repos/o/o/pulls/1", "tok")
    assert paginas_pedidas == [1, 2, 3]
    assert len(arquivos) == 205


def test_buscar_arquivos_para_quando_passa_do_limite_de_diff(monkeypatch):
    import httpx

    paginas_pedidas = []

    def _get(url, headers, params, timeout):
        paginas_pedidas.append(params["page"])
        return _RespostaFake(
            [{"filename": f"f{i}", "patch": "+" * 200} for i in range(100)]
        )

    monkeypatch.setattr(httpx, "get", _get)

    _BUSCAR_ORIGINAL("https://api.github.com/repos/o/o/pulls/1", "tok")
    # 100 arquivos × 200 caracteres já passam dos 12.000: uma página basta.
    assert paginas_pedidas == [1]


# --- Tokens do worker ---


def test_resumir_registra_tokens_do_worker(banco, monkeypatch):
    """O resumo do PR registra os tokens do worker numa atividade de `work`."""
    from langchain_core.messages import AIMessage

    from _orion import atividades

    class FakeWorker:
        def invoke(self, msgs):
            return AIMessage(
                content="Resumo.",
                usage_metadata={"input_tokens": 50, "output_tokens": 7, "total_tokens": 57},
            )

    monkeypatch.setattr(github.llm, "worker", lambda: FakeWorker())

    assert _RESUMIR_ORIGINAL("texto do PR", "gh-99") == "Resumo."
    gasto = sum(
        a["tokens"] for a in atividades.listar()
        if a["run_id"] == "gh-99" and a["agente"] == "work"
    )
    assert gasto == 57
