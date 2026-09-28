"""Testes do módulo `sentry.py` (task 2.1 / Requirements 1.1, 1.2, 1.7, 1.8, 2.*).

Cobrem, sem chamar o Sentry de verdade e usando as fixtures de payload real em
`tests/fixtures/`:

- Assinatura: HMAC válido → True; assinatura errada/ausente → False; sem
  `SENTRY_CLIENT_SECRET` → False (Requirements 1.1, 1.2).
- Parser tolerante: payload vazio/malformado e campos ausentes não derrubam
  (Requirement 1.8).
- Whitelist: dados pessoais das fixtures (e-mail, IP, id de usuário, headers,
  cookies, query string, corpo, `vars` de frame, breadcrumbs, contexto de
  usuário) NUNCA aparecem no resultado (Requirements 2.1, 2.2, 2.4).
- Máscara: e-mails, CPFs (com/sem pontuação), telefones e números longos viram
  `[removido]` em título, mensagem e culpado (Requirement 2.3).
- Mapa de projeto: slug conhecido → app/backend; desconhecido → `desconhecido`
  (Requirement 1.7).
"""

import hashlib
import hmac
import json
import os

import pytest

from _orion import sentry

_FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")
_SEGREDO = "segredo-da-integracao-do-sentry"

_PROJETOS = "orion-app:app,orion-api:backend"


def _fixture(nome: str) -> dict:
    with open(os.path.join(_FIXTURES, nome), encoding="utf-8") as arq:
        return json.load(arq)


def _corpo_bruto(nome: str) -> bytes:
    with open(os.path.join(_FIXTURES, nome), "rb") as arq:
        return arq.read()


def _assinar(corpo: bytes, segredo: str = _SEGREDO) -> str:
    return hmac.new(segredo.encode("utf-8"), corpo, hashlib.sha256).hexdigest()


@pytest.fixture(autouse=True)
def _ambiente(monkeypatch):
    """Segredo e mapa de projetos configurados para todos os testes."""
    monkeypatch.setenv("SENTRY_CLIENT_SECRET", _SEGREDO)
    monkeypatch.setenv("ORION_SENTRY_PROJETOS", _PROJETOS)


# --- Assinatura (Requirements 1.1, 1.2) ---


def test_assinatura_valida():
    corpo = b'{"action": "created"}'
    assert sentry.verificar_assinatura(corpo, _assinar(corpo)) is True


def test_assinatura_invalida():
    corpo = b'{"action": "created"}'
    assert sentry.verificar_assinatura(corpo, "assinatura-errada") is False


def test_assinatura_ausente():
    assert sentry.verificar_assinatura(b"{}", None) is False


def test_assinatura_sem_segredo_configurado(monkeypatch):
    monkeypatch.setenv("SENTRY_CLIENT_SECRET", "")
    corpo = b'{"action": "created"}'
    # Mesmo com um HMAC "correto" para o corpo, sem segredo no ambiente → False.
    assert sentry.verificar_assinatura(corpo, _assinar(corpo)) is False


def test_assinatura_confere_o_corpo_bruto():
    corpo = _corpo_bruto("sentry_issue_created.json")
    assert sentry.verificar_assinatura(corpo, _assinar(corpo)) is True
    # Um byte a mais invalida.
    assert sentry.verificar_assinatura(corpo + b" ", _assinar(corpo)) is False


# --- Mapa de projeto (Requirement 1.7) ---


def test_mapear_projeto_conhecido():
    assert sentry.mapear_projeto("orion-app") == "app"
    assert sentry.mapear_projeto("orion-api") == "backend"


def test_mapear_projeto_desconhecido():
    assert sentry.mapear_projeto("outro-projeto") == "desconhecido"
    assert sentry.mapear_projeto(None) == "desconhecido"
    assert sentry.mapear_projeto("") == "desconhecido"


# --- Máscara (Requirement 2.3) ---


def test_mascara_email():
    assert sentry.mascarar("erro do maria@paciente.com aqui") == "erro do [removido] aqui"


def test_mascara_cpf_com_e_sem_pontuacao():
    assert "[removido]" in sentry.mascarar("CPF 529.982.247-25")
    assert "529" not in sentry.mascarar("CPF 529.982.247-25")
    assert "[removido]" in sentry.mascarar("CPF 52998224725")
    assert "52998224725" not in sentry.mascarar("CPF 52998224725")


def test_mascara_telefone_br():
    assert "[removido]" in sentry.mascarar("ligue (11) 98765-4321")
    assert "98765" not in sentry.mascarar("ligue (11) 98765-4321")


def test_mascara_numeros_longos():
    assert sentry.mascarar("id 900112233 do usuario") == "id [removido] do usuario"


def test_mascara_texto_vazio_ou_none():
    assert sentry.mascarar(None) == ""
    assert sentry.mascarar("") == ""
    assert sentry.mascarar("sem nada sensível") == "sem nada sensível"


# --- Parser tolerante (Requirement 1.8) ---


def test_parser_payload_vazio_nao_derruba():
    assert sentry.interpretar_payload("issue", {}) is None
    assert sentry.interpretar_payload("event_alert", {}) is None


def test_parser_payload_nao_dict_nao_derruba():
    assert sentry.interpretar_payload("issue", None) is None  # type: ignore[arg-type]
    assert sentry.interpretar_payload("issue", "texto") is None  # type: ignore[arg-type]


def test_parser_recurso_desconhecido_e_ignorado():
    corpo = _fixture("sentry_issue_created.json")
    assert sentry.interpretar_payload("installation", corpo) is None
    assert sentry.interpretar_payload(None, corpo) is None


def test_parser_campos_ausentes_no_issue():
    # Só um id, sem título, nível, contagens, etc.: não pode lançar.
    corpo = {"action": "created", "data": {"issue": {"id": "999"}}}
    campos = sentry.interpretar_payload("issue", corpo)
    assert campos is not None
    assert campos["sentry_issue_id"] == "999"
    assert campos["titulo"] == ""
    assert campos["nivel"] is None
    assert campos["ocorrencias"] == 1
    assert campos["usuarios_afetados"] == 0
    assert campos["projeto"] == "desconhecido"
    assert campos["stack"] == []


def test_parser_stack_malformado_no_event_alert():
    # `exception` com forma inesperada não pode derrubar a extração de frames.
    corpo = {
        "data": {
            "event": {
                "issue_id": "5",
                "exception": {"values": "não é lista"},
            }
        }
    }
    campos = sentry.interpretar_payload("event_alert", corpo)
    assert campos is not None
    assert campos["stack"] == []


def test_parser_sem_issue_id_e_ignorado():
    corpo = {"data": {"issue": {"title": "sem id"}}}
    assert sentry.interpretar_payload("issue", corpo) is None


# --- Interpretação de issue.created (Requirements 1.7, 2.1) ---


def test_interpretar_issue_created():
    campos = sentry.interpretar_payload("issue", _fixture("sentry_issue_created.json"))
    assert campos is not None
    assert campos["sentry_issue_id"] == "1234567890"
    assert campos["titulo"] == "TypeError: Cannot read property 'nome' of undefined"
    assert campos["nivel"] == "error"
    assert campos["culpado"] == "src/screens/Perfil.tsx in carregarPerfil"
    assert campos["url"] == "https://orion.sentry.io/issues/1234567890/"
    assert campos["ocorrencias"] == 7
    assert campos["usuarios_afetados"] == 4
    assert campos["projeto"] == "app"
    assert campos["acao"] == "created"
    assert campos["recurso"] == "issue"


def test_interpretar_issue_resolved_expoe_acao():
    campos = sentry.interpretar_payload("issue", _fixture("sentry_issue_resolved.json"))
    assert campos is not None
    assert campos["acao"] == "resolved"
    assert campos["sentry_issue_id"] == "1234567890"


# --- Interpretação de event_alert e whitelist do stack (Requirements 2.1, 2.2) ---


def test_interpretar_event_alert_extrai_stack_da_whitelist():
    campos = sentry.interpretar_payload("event_alert", _fixture("sentry_event_alert.json"))
    assert campos is not None
    assert campos["sentry_issue_id"] == "1117540176"
    assert campos["projeto"] == "desconhecido"  # project é número, sem slug
    assert campos["release"] == "orion-api@a1b2c3d"
    assert campos["ambiente"] == "production"

    # Só frames in_app, com apenas os 4 campos da whitelist.
    stack = campos["stack"]
    assert len(stack) == 2  # dois frames in_app=true no fixture
    for frame in stack:
        assert set(frame.keys()) == {"arquivo", "funcao", "linha", "modulo"}
    assert stack[0]["arquivo"] == "src/servidor.ts"
    assert stack[1]["arquivo"] == "src/rotas/assinatura.ts"


def test_stack_nunca_traz_vars_do_frame():
    """`vars` de stack frames (variáveis locais) NUNCA saem (Requirement 2.2)."""
    campos = sentry.interpretar_payload("event_alert", _fixture("sentry_event_alert.json"))
    assert campos is not None
    serial = json.dumps(campos, ensure_ascii=False)
    assert "supersecreta" not in serial
    assert "abc123" not in serial
    assert "objeto-com-headers" not in serial


def test_limite_de_frames():
    frames = [
        {"filename": f"f{i}.ts", "function": "g", "lineno": i, "module": "m", "in_app": True}
        for i in range(50)
    ]
    corpo = {
        "data": {
            "event": {
                "issue_id": "7",
                "exception": {"values": [{"stacktrace": {"frames": frames}}]},
            }
        }
    }
    campos = sentry.interpretar_payload("event_alert", corpo)
    assert campos is not None
    assert len(campos["stack"]) == sentry.MAX_FRAMES


# --- Whitelist + máscara com payload de dados pessoais (Requirement 2.4) ---


def test_dados_pessoais_nunca_aparecem_no_resultado():
    campos = sentry.interpretar_payload(
        "event_alert", _fixture("sentry_event_dados_pessoais.json")
    )
    assert campos is not None
    serial = json.dumps(campos, ensure_ascii=False)

    # Dados pessoais que estavam no payload (request/user/breadcrumbs/vars/tags).
    assert "maria@paciente.com" not in serial
    assert "maria.paciente" not in serial
    assert "10.0.0.5" not in serial            # IP
    assert "162.218" not in serial             # IP das tags
    assert "Bearer" not in serial              # header Authorization
    assert "session=abc" not in serial         # cookie
    assert "4111 1111 1111 1111" not in serial # cartão em vars

    # E os textos técnicos foram mascarados (Requirement 2.3).
    assert "529.982.247-25" not in serial
    assert "52998224725" not in serial
    assert "900112233" not in serial
    assert "[removido]" in campos["titulo"]
    assert "[removido]" in campos["mensagem"]
    assert "[removido]" in campos["culpado"]


def test_whitelist_so_tem_campos_permitidos():
    campos = sentry.interpretar_payload(
        "event_alert", _fixture("sentry_event_dados_pessoais.json")
    )
    assert campos is not None
    permitidos = {
        "sentry_issue_id", "titulo", "mensagem", "nivel", "culpado", "release",
        "ambiente", "url", "ocorrencias", "usuarios_afetados", "primeira_vez",
        "ultima_vez", "projeto", "stack", "acao", "recurso",
    }
    assert set(campos.keys()) <= permitidos
    # Chaves de PII conhecidas nunca aparecem no dict.
    assert "user" not in campos
    assert "request" not in campos
    assert "tags" not in campos
    assert "breadcrumbs" not in campos


# --- Upsert, deduplicação e status (task 2.2 / Requirements 1.3, 1.4, 1.6) ---
#
# Estes testes usam a fixture `banco` (Postgres efêmero do pgserver), sem tocar
# em serviços reais. Provam a deduplicação por `sentry_issue_id` e a mudança de
# status por `resolved`/`ignored`.

from _orion import db  # noqa: E402


def _campos_issue(**over) -> dict:
    """Campos já interpretados de um issue.created, com sobrescritas por teste."""
    base = {
        "sentry_issue_id": "1234567890",
        "projeto": "app",
        "titulo": "TypeError: Cannot read property 'nome' of undefined",
        "nivel": "error",
        "culpado": "src/screens/Perfil.tsx in carregarPerfil",
        "release": "orion-app@a1b2c3d",
        "ambiente": "production",
        "url": "https://orion.sentry.io/issues/1234567890/",
        "ocorrencias": 7,
        "usuarios_afetados": 4,
        "primeira_vez": "2026-09-26T12:00:00Z",
        "ultima_vez": "2026-09-26T13:00:00Z",
        "projeto_slug": None,
        "stack": [{"arquivo": "src/screens/Perfil.tsx", "funcao": "carregarPerfil", "linha": 12, "modulo": None}],
        "acao": "created",
        "recurso": "issue",
    }
    base.update(over)
    return base


def test_registrar_incidente_novo(banco):
    """Primeiro evento cria o incidente e devolve `novo=True` (Requirement 1.3)."""
    resultado = sentry.registrar_incidente(_campos_issue())
    assert resultado is not None
    assert resultado["novo"] is True

    linha = db.um("select * from incidentes where id = %s", (resultado["id"],))
    assert linha["sentry_issue_id"] == "1234567890"
    assert linha["projeto"] == "app"
    assert linha["ocorrencias"] == 7
    assert linha["usuarios_afetados"] == 4
    assert linha["status"] == "aberto"
    # `stack` guardado como jsonb (volta como lista de dicts).
    assert linha["stack"][0]["arquivo"] == "src/screens/Perfil.tsx"


def test_evento_repetido_nao_duplica_so_atualiza_contagens(banco):
    """Mesmo `sentry_issue_id` não cria segunda linha (Requirement 1.6).

    Só atualiza `ocorrencias`, `usuarios_afetados` e `ultima_vez`, com o maior
    valor, e devolve `novo=False`.
    """
    primeiro = sentry.registrar_incidente(_campos_issue())
    assert primeiro["novo"] is True

    segundo = sentry.registrar_incidente(
        _campos_issue(
            ocorrencias=12,
            usuarios_afetados=9,
            ultima_vez="2026-09-26T15:30:00Z",
        )
    )
    assert segundo is not None
    assert segundo["novo"] is False
    assert segundo["id"] == primeiro["id"]  # mesma linha

    total = db.um("select count(*) as n from incidentes")["n"]
    assert total == 1  # não duplicou

    linha = db.um("select * from incidentes where id = %s", (primeiro["id"],))
    assert linha["ocorrencias"] == 12       # greatest(7, 12)
    assert linha["usuarios_afetados"] == 9  # greatest(4, 9)


def test_evento_repetido_mantem_o_maior_valor(banco):
    """`greatest`: um evento com contagens menores não reduz as guardadas."""
    primeiro = sentry.registrar_incidente(
        _campos_issue(ocorrencias=20, usuarios_afetados=15)
    )
    sentry.registrar_incidente(_campos_issue(ocorrencias=3, usuarios_afetados=1))

    linha = db.um("select * from incidentes where id = %s", (primeiro["id"],))
    assert linha["ocorrencias"] == 20       # greatest(20, 3)
    assert linha["usuarios_afetados"] == 15  # greatest(15, 1)


def test_resolved_muda_status_para_resolvido(banco):
    """Ação `resolved` → status `resolvido` (Requirement 1.4)."""
    sentry.registrar_incidente(_campos_issue())

    resultado = sentry.processar_evento(
        _campos_issue(acao="resolved")
    )
    assert resultado["resultado"] == "status"
    assert resultado["status"] == "resolvido"

    linha = db.um(
        "select status from incidentes where sentry_issue_id = %s", ("1234567890",)
    )
    assert linha["status"] == "resolvido"


def test_ignored_muda_status_para_ignorado(banco):
    """Ação `ignored` → status `ignorado` (Requirement 1.4)."""
    sentry.registrar_incidente(_campos_issue())

    resultado = sentry.processar_evento(_campos_issue(acao="ignored"))
    assert resultado["resultado"] == "status"
    assert resultado["status"] == "ignorado"

    linha = db.um(
        "select status from incidentes where sentry_issue_id = %s", ("1234567890",)
    )
    assert linha["status"] == "ignorado"


def test_status_de_issue_inexistente_nao_cria_incidente(banco):
    """`resolved` de uma issue que nunca chegou como `created` não cria linha."""
    resultado = sentry.processar_evento(
        _campos_issue(sentry_issue_id="000", acao="resolved")
    )
    assert resultado["resultado"] == "nao_encontrado"
    assert db.um("select count(*) as n from incidentes")["n"] == 0


def test_processar_evento_registra_created(banco):
    """`processar_evento` com `created` faz o upsert e sinaliza `novo`."""
    resultado = sentry.processar_evento(_campos_issue())
    assert resultado["resultado"] == "registrado"
    assert resultado["novo"] is True

    # Repetido pelo mesmo caminho: registrado, mas não é novo.
    de_novo = sentry.processar_evento(_campos_issue(ocorrencias=99))
    assert de_novo["resultado"] == "registrado"
    assert de_novo["novo"] is False
    assert db.um("select count(*) as n from incidentes")["n"] == 1


def test_processar_evento_event_alert_registra(banco):
    """`event_alert` (sem `action`) sempre registra/atualiza (Requirement 1.3)."""
    resultado = sentry.processar_evento(
        _campos_issue(acao=None, recurso="event_alert")
    )
    assert resultado["resultado"] == "registrado"
    assert resultado["novo"] is True


def test_processar_evento_acao_desconhecida_ignora(banco):
    """Ações fora de created/resolved/ignored são ignoradas (Requirement 1.5)."""
    resultado = sentry.processar_evento(_campos_issue(acao="assigned"))
    assert resultado["resultado"] == "ignorado"
    assert db.um("select count(*) as n from incidentes")["n"] == 0
