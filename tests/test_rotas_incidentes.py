"""Testes das rotas de incidentes do Vigia (task 6).

Cobrem os Requirements 6.4 e 6.6 com `TestClient`:

- `GET /api/incidentes`: 401 sem sessão; com sessão lista (abertos primeiro e
  filtro por `status`).
- `GET /api/incidentes/resumo`: 401 sem sessão; com sessão devolve
  `{"abertos": n}`.
- `GET /api/incidentes/{id}`: 401 sem sessão; com sessão traz o detalhe (com
  `diagnostico`); inexistente → 404.
- `POST /api/incidentes/{id}/status`: 401 sem sessão; status válido atualiza e
  devolve a linha; status inválido → 400; inexistente → 404.
- `POST /api/incidentes/{id}/diagnosticar`: 401 sem sessão; inexistente → 404;
  a rota delega a `vigia.diagnosticar`; e o diagnóstico manual respeita o limite
  por hora (Requirement 4.1): com o limite já atingido, devolve
  `{"status": "fila"}` SEM chamar o modelo.

Nenhum teste chama a Anthropic, o GitHub nem o Sentry (Requirement 8.1). Onde só
precisamos provar que a rota delega, substituímos `vigia.diagnosticar` por um
fake. No teste do limite real, deixamos o `diagnosticar` de verdade rodar mas
blindamos o modelo (`vigia.estruturar` e `especialistas.rodar_com_ferramentas`
levantam se forem chamados) e inserimos um `diagnostico_iniciado_em` recente
para que `dentro_do_limite()` seja False de fato — exercendo a query do limite.

Segue o padrão de `tests/test_rotas_chat_aprovacoes_reunioes.py` (fixture
`cliente` recarregando `index`, fixture `banco` e `_logar`; inserção direta de
linhas via `db`).
"""

import importlib

import pytest
from fastapi.testclient import TestClient
from psycopg.types.json import Json

from _orion import db

_SEGREDO = "segredo-de-teste-bem-longo-para-hmac"
_USUARIOS = "dimi:senha-dimi,jullyana:senha-jully"
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


def _inserir_incidente(**campos):
    """Insere um incidente e devolve o id.

    Defaults mínimos; aceita sobrescritas via `campos` (ex.: status=...,
    stack=..., diagnostico=..., ultima_vez=...).
    """
    dados = {
        "sentry_issue_id": "issue-1",
        "projeto": "app",
        "titulo": "TypeError: x is not defined",
        "nivel": "error",
        "culpado": "src/telas/Home.tsx",
        "release": "1.2.3",
        "ambiente": "production",
        "url": "https://sentry.io/orion/issues/1",
        "stack": [
            {"arquivo": "src/telas/Home.tsx", "funcao": "render",
             "linha": 42, "modulo": None}
        ],
        "ocorrencias": 7,
        "usuarios_afetados": 3,
        "status": "aberto",
        "diagnostico": None,
    }
    dados.update(campos)

    linha = db.um(
        """
        insert into incidentes (
            sentry_issue_id, projeto, titulo, nivel, culpado, release, ambiente,
            url, stack, ocorrencias, usuarios_afetados, status, diagnostico
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        returning id
        """,
        (
            dados["sentry_issue_id"],
            dados["projeto"],
            dados["titulo"],
            dados["nivel"],
            dados["culpado"],
            dados["release"],
            dados["ambiente"],
            dados["url"],
            Json(dados["stack"]) if dados["stack"] is not None else None,
            dados["ocorrencias"],
            dados["usuarios_afetados"],
            dados["status"],
            Json(dados["diagnostico"]) if dados["diagnostico"] is not None else None,
        ),
    )
    assert linha is not None
    return linha["id"]


# --- GET /api/incidentes ---


def test_lista_sem_sessao_da_401(cliente):
    assert cliente.get("/api/incidentes").status_code == 401


def test_lista_com_sessao_abertos_primeiro(cliente):
    # Um diagnosticado e um aberto: o aberto deve vir primeiro (Requirement 6.2).
    _inserir_incidente(sentry_issue_id="a", titulo="Diagnosticado",
                       status="diagnosticado")
    _inserir_incidente(sentry_issue_id="b", titulo="Aberto", status="aberto")

    _logar(cliente)
    resp = cliente.get("/api/incidentes")
    assert resp.status_code == 200
    corpo = resp.json()
    assert len(corpo) == 2
    assert corpo[0]["titulo"] == "Aberto"
    assert corpo[0]["status"] == "aberto"


def test_lista_filtra_por_status(cliente):
    _inserir_incidente(sentry_issue_id="a", titulo="Aberto", status="aberto")
    _inserir_incidente(sentry_issue_id="b", titulo="Resolvido",
                       status="resolvido")

    _logar(cliente)
    resp = cliente.get("/api/incidentes", params={"status": "resolvido"})
    assert resp.status_code == 200
    corpo = resp.json()
    assert len(corpo) == 1
    assert corpo[0]["titulo"] == "Resolvido"
    assert corpo[0]["status"] == "resolvido"


# --- GET /api/incidentes/resumo ---


def test_resumo_sem_sessao_da_401(cliente):
    assert cliente.get("/api/incidentes/resumo").status_code == 401


def test_resumo_conta_abertos(cliente):
    _inserir_incidente(sentry_issue_id="a", status="aberto")
    _inserir_incidente(sentry_issue_id="b", status="aberto")
    _inserir_incidente(sentry_issue_id="c", status="diagnosticado")

    _logar(cliente)
    resp = cliente.get("/api/incidentes/resumo")
    assert resp.status_code == 200
    assert resp.json() == {"abertos": 2}


# --- GET /api/incidentes/{id} ---


def test_detalhe_sem_sessao_da_401(cliente):
    assert cliente.get("/api/incidentes/1").status_code == 401


def test_detalhe_traz_incidente_com_diagnostico(cliente):
    diag = {
        "resumo": "Erro de referência",
        "causa_provavel": "Variável não definida",
        "confianca": "media",
        "arquivos_suspeitos": [{"caminho": "src/telas/Home.tsx", "motivo": "usa x"}],
        "pr_relacionado": None,
        "impacto": "Tela quebra",
        "proximo_passo": "Revisar Home.tsx",
        "corrigivel_automaticamente": False,
        "motivo": "Precisa revisão manual",
    }
    incidente_id = _inserir_incidente(status="diagnosticado", diagnostico=diag)

    _logar(cliente)
    resp = cliente.get(f"/api/incidentes/{incidente_id}")
    assert resp.status_code == 200
    corpo = resp.json()
    assert corpo["id"] == incidente_id
    assert corpo["titulo"] == "TypeError: x is not defined"
    assert corpo["diagnostico"]["causa_provavel"] == "Variável não definida"
    assert corpo["stack"][0]["arquivo"] == "src/telas/Home.tsx"


def test_detalhe_inexistente_da_404(cliente):
    _logar(cliente)
    assert cliente.get("/api/incidentes/9999").status_code == 404


# --- POST /api/incidentes/{id}/status ---


def test_mudar_status_sem_sessao_da_401(cliente):
    assert cliente.post(
        "/api/incidentes/1/status", json={"status": "resolvido"}
    ).status_code == 401


def test_mudar_status_valido_atualiza(cliente):
    incidente_id = _inserir_incidente(status="aberto")

    _logar(cliente)
    resp = cliente.post(
        f"/api/incidentes/{incidente_id}/status", json={"status": "resolvido"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"id": incidente_id, "status": "resolvido"}

    # Confirma a persistência.
    assert db.incidente(incidente_id)["status"] == "resolvido"


def test_mudar_status_invalido_da_400(cliente):
    incidente_id = _inserir_incidente(status="aberto")

    _logar(cliente)
    resp = cliente.post(
        f"/api/incidentes/{incidente_id}/status",
        json={"status": "diagnosticado"},  # não aceito pela rota (Requirement 6.4)
    )
    assert resp.status_code == 400
    # Não mudou o status.
    assert db.incidente(incidente_id)["status"] == "aberto"


def test_mudar_status_inexistente_da_404(cliente):
    _logar(cliente)
    resp = cliente.post(
        "/api/incidentes/9999/status", json={"status": "ignorado"}
    )
    assert resp.status_code == 404


# --- POST /api/incidentes/{id}/diagnosticar ---


def test_diagnosticar_sem_sessao_da_401(cliente):
    assert cliente.post("/api/incidentes/1/diagnosticar").status_code == 401


def test_diagnosticar_inexistente_da_404(cliente, monkeypatch):
    """Incidente inexistente → 404, sem sequer chamar `vigia.diagnosticar`."""
    from _orion import vigia

    def _nao_deveria(incidente_id):
        raise AssertionError("não deveria diagnosticar incidente inexistente")

    monkeypatch.setattr(vigia, "diagnosticar", _nao_deveria)

    _logar(cliente)
    assert cliente.post("/api/incidentes/9999/diagnosticar").status_code == 404


def test_diagnosticar_delega_para_vigia(cliente, monkeypatch):
    """A rota repassa o incidente a `vigia.diagnosticar` e devolve o resultado."""
    from _orion import vigia

    incidente_id = _inserir_incidente(status="aberto")
    capturado = {}

    def _fake(id_):
        capturado["id"] = id_
        return {"status": "diagnosticado", "id": id_, "confianca": "alta"}

    monkeypatch.setattr(vigia, "diagnosticar", _fake)

    _logar(cliente)
    resp = cliente.post(f"/api/incidentes/{incidente_id}/diagnosticar")
    assert resp.status_code == 200
    assert resp.json() == {
        "status": "diagnosticado", "id": incidente_id, "confianca": "alta"
    }
    assert capturado["id"] == incidente_id


def test_diagnosticar_manual_respeita_limite_sem_chamar_modelo(cliente, monkeypatch):
    """Com o limite por hora atingido, a rota devolve `{"status": "fila"}`.

    Aqui deixamos o `vigia.diagnosticar` REAL rodar (a rota só delega), mas:

    - definimos `ORION_MAX_DIAGNOSTICOS_HORA=1`;
    - inserimos um incidente já com `diagnostico_iniciado_em = now()`, que conta
      na janela de 60 min — então `dentro_do_limite()` consulta o banco de
      verdade e devolve False (Requirement 4.1);
    - blindamos o modelo: `especialistas.rodar_com_ferramentas` e
      `vigia.estruturar` levantam se forem chamados. Como o limite corta antes,
      eles NÃO devem ser chamados (Requirement 8.1).
    """
    from _orion import especialistas, vigia

    monkeypatch.setenv("ORION_MAX_DIAGNOSTICOS_HORA", "1")

    # Um diagnóstico já iniciado nesta hora ocupa a única vaga do limite.
    db.executar(
        """
        insert into incidentes (sentry_issue_id, projeto, titulo,
                                diagnostico_iniciado_em)
        values ('ocupa-vaga', 'app', 'Erro anterior', now())
        """
    )
    # O incidente que o sócio tenta diagnosticar agora, na fila.
    incidente_id = _inserir_incidente(sentry_issue_id="na-fila", status="aberto")

    def _nao_chamar_modelo(*args, **kwargs):
        raise AssertionError("o modelo não deve ser chamado acima do limite")

    monkeypatch.setattr(
        especialistas, "rodar_com_ferramentas", _nao_chamar_modelo
    )
    monkeypatch.setattr(vigia, "estruturar", _nao_chamar_modelo)

    _logar(cliente)
    resp = cliente.post(f"/api/incidentes/{incidente_id}/diagnosticar")
    assert resp.status_code == 200
    assert resp.json()["status"] == "fila"

    # O incidente continua aberto (não foi diagnosticado).
    assert db.incidente(incidente_id)["status"] == "aberto"
