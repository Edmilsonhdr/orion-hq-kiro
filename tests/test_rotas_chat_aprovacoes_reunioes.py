"""Testes das rotas de chat, aprovações e reuniões (task 7).

Cobrem os Requirements 2.1, 2.3, 6.4, 6.5, 6.6 e 9.1 com `TestClient`:

- `GET /api/mensagens`: 401 sem sessão; com sessão lista e filtra por `desde`.
- `POST /api/chat`: 401 sem sessão; com sessão chama `execucao.conversar`
  (substituído por um fake) com (usuario, texto) e devolve o dict.
- `GET /api/aprovacoes`: 401 sem sessão; com sessão lista pendentes + decididas.
- `POST /api/aprovacoes/{id}`: 401 sem sessão; 403 não-aprovador; 200 aprovador
  (com fake de `execucao.decidir_aprovacao`); caso `ja_decidida` propagado.
- `GET /api/reunioes`: 401 sem sessão; com sessão lista as próximas.
- `GET /api/reunioes/{id}.ics`: VCALENDAR válido, UID correto,
  content-type text/calendar; reunião inexistente → 404.

Nenhum teste chama a API da Anthropic: `conversar` e `decidir_aprovacao` são
substituídos por fakes onde necessário. Segue o padrão de
`tests/test_rotas_atividades.py` (fixture `cliente` + `banco` + `_logar`).
"""

import importlib

import pytest
from fastapi.testclient import TestClient

from _orion import db

_SEGREDO = "segredo-de-teste-bem-longo-para-hmac"
_USUARIOS = "dimi:senha-dimi,jullyana:senha-jully,estranho:senha-x"
# Só dimi e jullyana aprovam; "estranho" loga mas não é aprovador (403).
_APROVADORES = "dimi,jullyana"


@pytest.fixture()
def cliente(monkeypatch, banco):
    """Cliente HTTP de teste com auth configurada e banco efêmero."""
    monkeypatch.setenv("ORION_SESSION_SECRET", _SEGREDO)
    monkeypatch.setenv("ORION_USERS", _USUARIOS)
    monkeypatch.setenv("ORION_APPROVERS", _APROVADORES)

    import index

    importlib.reload(index)
    return TestClient(index.app, base_url="http://localhost")


def _logar(cliente, usuario="dimi", senha="senha-dimi"):
    resp = cliente.post("/api/login", json={"usuario": usuario, "senha": senha})
    assert resp.status_code == 200


def _inserir_aprovacao(chave, proposta, pedido_por, status="pendente",
                       decidido_por=None):
    """Insere uma aprovação direto no banco (via db) para os testes."""
    from psycopg.types.json import Json

    linha = db.um(
        """
        insert into aprovacoes
            (run_id, chave, tipo, proposta, pedido_por, status, decidido_por,
             decidido_em)
        values (%s, %s, 'criar_reuniao', %s, %s, %s, %s,
                case when %s <> 'pendente' then now() else null end)
        returning id
        """,
        (
            "run-x", chave, Json(proposta), pedido_por, status, decidido_por,
            status,
        ),
    )
    return linha["id"]


def _inserir_reuniao(titulo, inicio_iso, fim_iso, participantes, pauta):
    """Insere uma reunião direto no banco (via db) para os testes."""
    linha = db.um(
        """
        insert into reunioes (titulo, inicio, fim, participantes, pauta,
                              criado_por, run_id)
        values (%s, %s, %s, %s, %s, 'dimi', 'run-x')
        returning id
        """,
        (titulo, inicio_iso, fim_iso, participantes, pauta),
    )
    return linha["id"]


# --- GET /api/mensagens ---


def test_mensagens_sem_sessao_da_401(cliente):
    assert cliente.get("/api/mensagens").status_code == 401


def test_mensagens_com_sessao_lista(cliente):
    db.salvar_mensagem("dimi", "olá")
    db.salvar_mensagem("Orquestrador", "oi, tudo bem?", run_id="run-1")

    _logar(cliente)
    resp = cliente.get("/api/mensagens")
    assert resp.status_code == 200
    corpo = resp.json()
    assert [m["id"] for m in corpo] == [1, 2]
    assert corpo[0]["autor"] == "dimi"
    assert corpo[1]["texto"] == "oi, tudo bem?"


def test_mensagens_com_desde_filtra(cliente):
    for i in range(3):
        db.salvar_mensagem("dimi", f"msg {i}")

    _logar(cliente)
    resp = cliente.get("/api/mensagens", params={"desde": 1})
    assert resp.status_code == 200
    assert [m["id"] for m in resp.json()] == [2, 3]


# --- POST /api/chat ---


def test_chat_sem_sessao_da_401(cliente):
    assert cliente.post("/api/chat", json={"texto": "oi"}).status_code == 401


def test_chat_com_sessao_chama_conversar(cliente, monkeypatch):
    """A rota chama `execucao.conversar(usuario, texto)` e devolve o dict."""
    from _orion import execucao

    capturado = {}

    def _fake_conversar(usuario, texto):
        capturado["args"] = (usuario, texto)
        return {"status": "respondido", "run_id": "abc", "resposta": "pronto"}

    monkeypatch.setattr(execucao, "conversar", _fake_conversar)

    _logar(cliente)
    resp = cliente.post("/api/chat", json={"texto": "o que mudou?"})
    assert resp.status_code == 200
    assert resp.json() == {
        "status": "respondido",
        "run_id": "abc",
        "resposta": "pronto",
    }
    assert capturado["args"] == ("dimi", "o que mudou?")


# --- GET /api/aprovacoes ---


def test_aprovacoes_sem_sessao_da_401(cliente):
    assert cliente.get("/api/aprovacoes").status_code == 401


def test_aprovacoes_lista_pendentes_e_decididas(cliente):
    _inserir_aprovacao("run-x:0", {"titulo": "Reunião A"}, "dimi")
    _inserir_aprovacao(
        "run-x:1", {"titulo": "Reunião B"}, "jullyana",
        status="aprovada", decidido_por="dimi",
    )

    _logar(cliente)
    resp = cliente.get("/api/aprovacoes")
    assert resp.status_code == 200
    corpo = resp.json()
    assert len(corpo) == 2
    # Pendentes primeiro (Requirement 9.1).
    assert corpo[0]["status"] == "pendente"
    assert corpo[0]["proposta"] == {"titulo": "Reunião A"}
    assert corpo[0]["pedido_por"] == "dimi"


def test_aprovacoes_filtra_por_status(cliente):
    _inserir_aprovacao("run-x:0", {"titulo": "A"}, "dimi")
    _inserir_aprovacao(
        "run-x:1", {"titulo": "B"}, "dimi",
        status="recusada", decidido_por="jullyana",
    )

    _logar(cliente)
    resp = cliente.get("/api/aprovacoes", params={"status": "pendente"})
    assert resp.status_code == 200
    corpo = resp.json()
    assert len(corpo) == 1
    assert corpo[0]["status"] == "pendente"


# --- POST /api/aprovacoes/{id} ---


def test_decidir_sem_sessao_da_401(cliente):
    assert cliente.post(
        "/api/aprovacoes/1", json={"aprovado": True}
    ).status_code == 401


def test_decidir_nao_aprovador_da_403(cliente):
    _logar(cliente, usuario="estranho", senha="senha-x")
    resp = cliente.post("/api/aprovacoes/1", json={"aprovado": True})
    assert resp.status_code == 403


def test_decidir_aprovador_chama_execucao(cliente, monkeypatch):
    """Aprovador com fake de `decidir_aprovacao` → 200 com o dict retornado."""
    from _orion import execucao

    capturado = {}

    def _fake(aprovacao_id, usuario, aprovado):
        capturado["args"] = (aprovacao_id, usuario, aprovado)
        return {"status": "respondido", "run_id": "r1", "resposta": "feito"}

    monkeypatch.setattr(execucao, "decidir_aprovacao", _fake)

    _logar(cliente)
    resp = cliente.post("/api/aprovacoes/7", json={"aprovado": True})
    assert resp.status_code == 200
    assert resp.json()["status"] == "respondido"
    assert capturado["args"] == (7, "dimi", True)


def test_decidir_recusar_chama_execucao(cliente, monkeypatch):
    """Aprovador recusando → a rota repassa `aprovado=False` (Requirement 6.5)."""
    from _orion import execucao

    capturado = {}

    def _fake(aprovacao_id, usuario, aprovado):
        capturado["args"] = (aprovacao_id, usuario, aprovado)
        return {"status": "respondido", "run_id": "r2", "resposta": "recusado"}

    monkeypatch.setattr(execucao, "decidir_aprovacao", _fake)

    _logar(cliente, usuario="jullyana", senha="senha-jully")
    resp = cliente.post("/api/aprovacoes/3", json={"aprovado": False})
    assert resp.status_code == 200
    assert resp.json()["status"] == "respondido"
    assert capturado["args"] == (3, "jullyana", False)


def test_decidir_ja_decidida_propaga(cliente, monkeypatch):
    """Caso `ja_decidida` → 200 com `{"status": "ja_decidida"}` (Requirement 6.6)."""
    from _orion import execucao

    monkeypatch.setattr(
        execucao, "decidir_aprovacao",
        lambda i, u, a: {"status": "ja_decidida"},
    )

    _logar(cliente)
    resp = cliente.post("/api/aprovacoes/9", json={"aprovado": False})
    assert resp.status_code == 200
    assert resp.json() == {"status": "ja_decidida"}


# --- POST /api/aprovacoes/{id}/retomar ---


def test_retomar_sem_sessao_da_401(cliente):
    assert cliente.post("/api/aprovacoes/1/retomar").status_code == 401


def test_retomar_nao_aprovador_da_403(cliente):
    _logar(cliente, usuario="estranho", senha="senha-x")
    assert cliente.post("/api/aprovacoes/1/retomar").status_code == 403


def test_retomar_sem_erro_da_409(cliente):
    """Aprovação que não está com `erro` não pode ser retomada."""
    aprovacao_id = _inserir_aprovacao("run-x:0", {"titulo": "A"}, "dimi")
    _logar(cliente)
    resp = cliente.post(f"/api/aprovacoes/{aprovacao_id}/retomar")
    assert resp.status_code == 409


def test_retomar_aprovador_chama_execucao(cliente, monkeypatch):
    from _orion import execucao

    capturado = {}

    def _fake(aprovacao_id):
        capturado["id"] = aprovacao_id
        return {"status": "respondido", "run_id": "r1", "resposta": "feito"}

    monkeypatch.setattr(execucao, "retomar_aprovacao", _fake)

    _logar(cliente, usuario="jullyana", senha="senha-jully")
    resp = cliente.post("/api/aprovacoes/5/retomar")
    assert resp.status_code == 200
    assert resp.json()["status"] == "respondido"
    assert capturado["id"] == 5


# --- GET /api/reunioes ---


def test_reunioes_sem_sessao_da_401(cliente):
    assert cliente.get("/api/reunioes").status_code == 401


def test_reunioes_lista_proximas(cliente):
    # Uma futura e uma passada: só a futura deve aparecer.
    _inserir_reuniao(
        "Futura", "2999-01-01T15:00:00-03:00", "2999-01-01T16:00:00-03:00",
        ["Dimi"], ["Item 1"],
    )
    _inserir_reuniao(
        "Passada", "2000-01-01T15:00:00-03:00", "2000-01-01T16:00:00-03:00",
        ["Dimi"], ["Antigo"],
    )

    _logar(cliente)
    resp = cliente.get("/api/reunioes")
    assert resp.status_code == 200
    corpo = resp.json()
    assert len(corpo) == 1
    assert corpo[0]["titulo"] == "Futura"
    assert corpo[0]["participantes"] == ["Dimi"]


# --- GET /api/reunioes/{id}.ics ---


def test_ics_gera_vcalendar_valido(cliente):
    rid = _inserir_reuniao(
        "Semanal Orion", "2026-09-29T15:00:00-03:00",
        "2026-09-29T15:30:00-03:00", ["Dimi", "Jullyana"],
        ["Onboarding", "Custos"],
    )

    _logar(cliente)
    resp = cliente.get(f"/api/reunioes/{rid}.ics")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/calendar")

    corpo = resp.text
    assert "BEGIN:VCALENDAR" in corpo
    assert "BEGIN:VEVENT" in corpo
    assert f"UID:reuniao-{rid}@orion-hq" in corpo
    assert "SUMMARY:Semanal Orion" in corpo
    # 15:00 -03:00 = 18:00 UTC.
    assert "DTSTART:20260929T180000Z" in corpo
    assert "DTEND:20260929T183000Z" in corpo
    assert "END:VCALENDAR" in corpo


def test_ics_inexistente_da_404(cliente):
    _logar(cliente)
    assert cliente.get("/api/reunioes/9999.ics").status_code == 404


def test_ics_sem_sessao_da_401(cliente):
    assert cliente.get("/api/reunioes/1.ics").status_code == 401
