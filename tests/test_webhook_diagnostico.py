"""Teste de ponta a ponta do webhook do Sentry ligado ao diagnóstico (task 4.5).

Requirements 3.1 e 8.2: quando um incidente NOVO chega pelo webhook do Sentry,
o sistema dispara o diagnóstico do Rui (síncrono, no mesmo estilo da ingestão do
GitHub) e o Orquestrador posta o resumo no chat. Nada de serviços reais
(Anthropic/GitHub/Sentry): o modelo é simulado.

O que este teste faz de verdade (sem mock) e o que simula:

- REAL: a rota `POST /api/webhooks/sentry` valida a assinatura, `sentry.interpretar_payload`
  aplica a whitelist/máscara e `sentry.processar_evento` grava o incidente no
  Postgres efêmero da fixture `banco`. Ou seja, o upsert e a deduplicação são
  exercitados de verdade.
- SIMULADO: `vigia.especialistas.rodar_com_ferramentas` (o loop do Rui/Tobias) e
  `vigia.estruturar` (a saída estruturada) são fakes — nenhuma chamada à
  Anthropic. `github_leitura.ultimo_evento_stack` é neutralizado para não tocar
  no Sentry na busca best-effort de stack.

Cenários (Requirement 8.2):

1. `issue.created` novo → incidente criado, status `diagnosticado`,
   `incidentes.diagnostico` salvo e mensagem do Orquestrador no chat (Req. 3.1/3.8).
2. Segundo webhook com o MESMO `sentry_issue_id` (evento repetido, `novo=False`)
   NÃO dispara novo diagnóstico: o diagnóstico roda uma única vez, o número de
   mensagens do Orquestrador não aumenta e o status permanece (dedup, Req. 1.6).
"""

import hashlib
import hmac
import importlib
import json
import os

import pytest
from fastapi.testclient import TestClient

_SESSION_SECRET = "segredo-de-sessao-bem-longo-para-hmac"
_CLIENT_SECRET = "segredo-da-integracao-do-sentry"
_PROJETOS = "orion-app:app,orion-api:backend"

_FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def _fixture_bytes(nome: str) -> bytes:
    with open(os.path.join(_FIXTURES, nome), "rb") as arq:
        return arq.read()


def _assinar(corpo: bytes, segredo: str = _CLIENT_SECRET) -> str:
    """HMAC-SHA256 hex do corpo bruto (como o Sentry manda no header)."""
    return hmac.new(segredo.encode("utf-8"), corpo, hashlib.sha256).hexdigest()


@pytest.fixture()
def cliente(banco, monkeypatch):
    """Cliente HTTP de teste com Postgres efêmero + segredos do Sentry.

    Combina a fixture `banco` (aponta `DATABASE_URL` para o Postgres do pgserver
    e limpa as tabelas) com o env do webhook do Sentry. Recarrega `index` DEPOIS
    de configurar o ambiente, como as demais fixtures de rota.
    """
    monkeypatch.setenv("ORION_SESSION_SECRET", _SESSION_SECRET)
    monkeypatch.setenv("SENTRY_CLIENT_SECRET", _CLIENT_SECRET)
    monkeypatch.setenv("ORION_SENTRY_PROJETOS", _PROJETOS)

    import index

    importlib.reload(index)
    return TestClient(index.app, base_url="http://localhost")


def _enviar_issue_created(cliente):
    """Envia o fixture `issue.created` assinado, com os cabeçalhos do Sentry."""
    bruto = _fixture_bytes("sentry_issue_created.json")
    cabecalhos = {
        "Content-Type": "application/json",
        "Sentry-Hook-Resource": "issue",
        "Sentry-Hook-Signature": _assinar(bruto),
    }
    return cliente.post("/api/webhooks/sentry", content=bruto, headers=cabecalhos)


@pytest.fixture()
def diagnostico_simulado(monkeypatch):
    """Neutraliza toda chamada externa do diagnóstico com fakes (Requirement 8.2).

    - `vigia.especialistas.rodar_com_ferramentas` devolve um relatório fixo e
      conta quantas vezes o Rui foi acionado (para checar a deduplicação).
    - `vigia.estruturar` devolve um `Diagnostico` fixo + tokens, sem tocar no
      modelo estruturado real.
    - `github_leitura.ultimo_evento_stack` devolve `[]`, para a busca best-effort
      de stack não chamar o Sentry.

    Devolve o contador de execuções do diagnóstico.
    """
    from _orion import github_leitura, vigia

    contador = {"diagnosticos": 0}

    def _fake_rodar(agente, sistema, instrucao, ferramentas, run_id, max_voltas=8):
        contador["diagnosticos"] += 1
        return "Relatório do Rui: a variável 'nome' chega indefinida ao abrir o Perfil."

    def _fake_estruturar(relatorio, incidente):
        diag = vigia.Diagnostico(
            resumo="Perfil quebra ao ler 'nome' de undefined",
            causa_provavel="objeto de perfil chega sem o campo 'nome'",
            confianca="media",
            arquivos_suspeitos=[
                {"caminho": "src/screens/Perfil.tsx", "motivo": "acessa perfil.nome"}
            ],
            pr_relacionado=None,
            impacto="tela de perfil não carrega",
            proximo_passo="proteger o acesso a perfil.nome",
            corrigivel_automaticamente=True,
            motivo="mudança pequena e localizada",
        )
        return diag, 42

    monkeypatch.setattr(vigia.especialistas, "rodar_com_ferramentas", _fake_rodar)
    monkeypatch.setattr(vigia, "estruturar", _fake_estruturar)
    monkeypatch.setattr(github_leitura, "ultimo_evento_stack", lambda issue: [])

    return contador


def test_webhook_novo_incidente_dispara_diagnostico_e_posta_no_chat(
    cliente, diagnostico_simulado
):
    """Ponta a ponta: webhook → incidente → diagnóstico → mensagem no chat.

    Requirements 3.1, 3.8, 8.2.
    """
    from _orion import db

    resp = _enviar_issue_created(cliente)
    assert resp.status_code == 200
    # O contrato da rota não muda: o corpo é o `resultado` do registro.
    corpo = resp.json()
    assert corpo["resultado"] == "registrado"
    assert corpo["novo"] is True

    # O diagnóstico rodou exatamente uma vez para o incidente novo.
    assert diagnostico_simulado["diagnosticos"] == 1

    # O incidente foi criado e diagnosticado.
    incidente = db.um(
        """
        select id, status, diagnostico, diagnosticado_em
        from incidentes
        where sentry_issue_id = %s
        """,
        ("1234567890",),
    )
    assert incidente is not None
    assert incidente["status"] == "diagnosticado"
    assert incidente["diagnosticado_em"] is not None
    assert incidente["diagnostico"]["causa_provavel"].startswith("objeto de perfil")

    # O Orquestrador postou o resumo no chat (Requirement 3.8).
    do_orq = [m for m in db.listar_mensagens() if m["autor"] == "Orquestrador"]
    assert len(do_orq) == 1
    texto = do_orq[0]["texto"]
    assert "app" in texto  # projeto
    assert "objeto de perfil" in texto  # causa provável
    assert "Detalhes em Incidentes" in texto


def test_webhook_evento_repetido_nao_redispara_diagnostico(
    cliente, diagnostico_simulado
):
    """Segundo webhook com o mesmo issue (dedup) NÃO dispara novo diagnóstico.

    Requirements 1.6, 8.2: o evento repetido vem com `novo=False`; o diagnóstico
    roda uma única vez, o nº de mensagens do Orquestrador não aumenta e o status
    permanece `diagnosticado`.
    """
    from _orion import db

    # Primeiro evento: cria e diagnostica.
    primeiro = _enviar_issue_created(cliente)
    assert primeiro.json()["novo"] is True
    assert diagnostico_simulado["diagnosticos"] == 1

    mensagens_apos_primeiro = len(
        [m for m in db.listar_mensagens() if m["autor"] == "Orquestrador"]
    )
    assert mensagens_apos_primeiro == 1

    total_incidentes = db.um("select count(*) as n from incidentes")["n"]
    assert total_incidentes == 1

    # Segundo evento com o MESMO sentry_issue_id → apenas atualiza contagens.
    segundo = _enviar_issue_created(cliente)
    assert segundo.status_code == 200
    assert segundo.json()["novo"] is False

    # O diagnóstico NÃO rodou de novo (dedup).
    assert diagnostico_simulado["diagnosticos"] == 1

    # Não duplicou o incidente e o status continua `diagnosticado`.
    assert db.um("select count(*) as n from incidentes")["n"] == 1
    incidente = db.um(
        "select status from incidentes where sentry_issue_id = %s", ("1234567890",)
    )
    assert incidente["status"] == "diagnosticado"

    # Nenhuma nova mensagem do Orquestrador.
    do_orq = [m for m in db.listar_mensagens() if m["autor"] == "Orquestrador"]
    assert len(do_orq) == 1
