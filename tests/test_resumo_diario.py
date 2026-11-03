"""Resumo diário (chat + e-mail opcional), feed .ics assinável e uso por agente."""

import importlib
from datetime import date

import pytest
from fastapi.testclient import TestClient

from _orion import atividades, calendario, comercial, config, db, emails, resumo, tarefas

HOJE = date(2026, 11, 3)


@pytest.fixture()
def cliente(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi,jullyana:senha-ju")
    monkeypatch.setenv("CRON_SECRET", "cron-secreto")
    monkeypatch.setenv("ORION_BASE_URL", "https://hq.exemplo.com")
    import index

    importlib.reload(index)
    c = TestClient(index.app, base_url="http://localhost")
    c.post("/api/login", json={"usuario": "dimi", "senha": "senha-dimi"})
    return c


@pytest.fixture()
def dados(banco, monkeypatch):
    monkeypatch.setenv("ORION_USERS", "dimi:a,jullyana:b")
    org = comercial.criar_organizacao({"nome": "Clínica Vida"})
    comercial.criar_negocio(org["id"], {"titulo": "Piloto", "proximo_passo": "Ligar, hoje; ok", "proximo_passo_em": "2026-11-03"}, "dimi")
    tarefas.criar({"titulo": "Enviar contrato", "responsavel": "dimi", "prazo": "2026-11-01"}, "dimi")
    db.executar("insert into reunioes (titulo, inicio, fim, participantes) values ('Demo', '2026-11-03T17:00:00Z', '2026-11-03T18:00:00Z', '{dimi}')")


def test_texto_do_resumo(dados):
    texto = resumo.texto_resumo_diario(calendario.agenda(HOJE), 2, 1)
    assert "**Atrasados**" in texto and "Enviar contrato" in texto
    assert "**Hoje**" in texto and "Demo" in texto and "14:00" in texto
    assert "2 aprovações pendentes" in texto and "1 incidente aberto" in texto
    vazio = {"atrasados": [], "de_hoje": [], "proximos": []}
    assert resumo.texto_resumo_diario(vazio, 0, 0) == ""
    assert "1 aprovação pendente" in resumo.texto_resumo_diario(vazio, 1, 0)


def test_resumo_diario_posta_no_chat_e_envia_email_so_se_configurado(dados, monkeypatch):
    enviados = []
    monkeypatch.setattr(emails, "enviar", lambda para, assunto, texto: enviados.append((para, "**" in texto)) or True)
    r = resumo.resumo_diario()
    assert r["status"] == "enviado" and r["emails"] == 0 and enviados == []  # sem Resend configurado
    assert any("resumo do dia" in m["texto"] for m in db.listar_mensagens(0))

    monkeypatch.setenv("RESEND_API_KEY", "chave")
    monkeypatch.setenv("ORION_EMAILS", "dimi:dimi@x.com,jullyana:ju@x.com,sem-arroba:xyz")
    r = resumo.resumo_diario()
    assert r["emails"] == 2 and enviados == [("dimi@x.com", False), ("jullyana@x.com".replace("jullyana", "ju"), False)]


def test_resumo_diario_sem_pendencias_nao_posta(banco):
    assert resumo.resumo_diario() == {"status": "sem_pendencias", "emails": 0}
    assert db.listar_mensagens(0) == []


def test_email_nunca_lanca(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "chave")
    import httpx

    def quebra(*a, **k):
        raise httpx.ConnectError("sem rede")

    monkeypatch.setattr(httpx, "post", quebra)
    assert emails.enviar("a@b.com", "x", "y") is False
    monkeypatch.delenv("RESEND_API_KEY")
    assert emails.enviar("a@b.com", "x", "y") is False


def test_cron_diario_exige_o_segredo(cliente, dados):
    assert cliente.get("/api/cron/resumo-diario").status_code == 401
    assert cliente.get("/api/cron/resumo-diario", headers={"Authorization": "Bearer errado"}).status_code == 401
    ok = cliente.get("/api/cron/resumo-diario", headers={"Authorization": "Bearer cron-secreto"})
    assert ok.status_code == 200 and ok.json()["status"] == "enviado"


def test_feed_ics(cliente, dados):
    url = cliente.get("/api/calendario/feed").json()["url"]
    assert url.startswith("https://hq.exemplo.com/api/calendario/feed.ics?token=dimi.")
    token = url.split("token=")[1]
    anonimo = TestClient(cliente.app, base_url="http://localhost")
    r = anonimo.get(f"/api/calendario/feed.ics?token={token}")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
    corpo = r.text
    assert corpo.startswith("BEGIN:VCALENDAR\r\n") and corpo.rstrip().endswith("END:VCALENDAR")
    assert "SUMMARY:Demo" in corpo and "DTSTART:20261103T170000Z" in corpo
    assert "SUMMARY:[Tarefa] Enviar contrato" in corpo and "DTSTART;VALUE=DATE:20261101" in corpo
    assert "Ligar\\, hoje\; ok" in corpo  # vírgula e ponto e vírgula escapados
    assert anonimo.get("/api/calendario/feed.ics?token=dimi.errado").status_code == 401
    assert anonimo.get("/api/calendario/feed.ics?token=fantasma.abc").status_code == 401
    assert anonimo.get("/api/calendario/feed.ics").status_code == 422


def test_linhas_longas_do_ics_sao_dobradas():
    partes = calendario._dobrar("SUMMARY:" + "ã" * 100)
    assert all(len(p.encode("utf-8")) <= 75 for p in partes) and "".join(p.lstrip(" ") if i else p for i, p in enumerate(partes)) == "SUMMARY:" + "ã" * 100


def test_uso_por_agente_e_execucoes(banco):
    atividades.emitir("r1", "tech", "inicio", "começou")
    atividades.emitir("r1", "tech", "pensando", "lendo", tokens=120)
    atividades.emitir("r1", "tech", "concluiu", "feito", tokens=30)
    atividades.emitir("r2", "tech", "erro", "falhou")
    atividades.emitir("r3", "negocios", "pensando", "x", tokens=50)
    uso = atividades.uso_por_agente(7)
    assert uso["agentes"]["tech"]["tokens"] == 150 and uso["agentes"]["tech"]["execucoes"] == 2
    assert uso["agentes"]["tech"]["serie"][-1] == 150 and len(uso["agentes"]["tech"]["serie"]) == 7
    assert uso["agentes"]["negocios"]["tokens"] == 50
    runs = atividades.execucoes_do_agente("tech")
    assert [r["run_id"] for r in runs] == ["r2", "r1"]
    assert runs[0]["erro"] is True and runs[1]["tokens"] == 150 and runs[1]["detalhe"] == "começou"


def test_rotas_de_uso(cliente):
    atividades.emitir("r1", "tech", "pensando", "x", tokens=10)
    assert cliente.get("/api/agentes/uso?dias=7").json()["agentes"]["tech"]["tokens"] == 10
    assert len(cliente.get("/api/agentes/tech/execucoes").json()) == 1
