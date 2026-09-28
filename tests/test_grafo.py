"""Testes do grafo do Orquestrador (task 6.1).

Exercitam o `StateGraph` sem tocar na API da Anthropic: substituímos as funções
isoladas `grafo.decidir` e `grafo.redigir` (design.md, Testing Strategy) e os
especialistas (`grafo.especialistas.tech/negocios/propor_reuniao`) por fakes.

O grafo é compilado com `MemorySaver` (checkpointer em memória) para não exigir
Postgres na compilação; as atividades, porém, são gravadas de verdade no
Postgres efêmero da fixture `banco`, então os testes inspecionam o log via
`atividades.listar()`.

Cobrem:
- roteamento supervisor → tech → supervisor → responder (fluxo base);
- roteamento agenda → aprovacao → supervisor;
- limite de 4 passos (Requirement 3.4): o supervisor responde ao chegar em 4;
- atividades `delegou` (de/para) e `resposta` (Requirements 3.2, 3.5).
"""

from datetime import timedelta
from typing import Any

from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from _orion import atividades, config, db, grafo


def _compilar():
    """Compila o grafo com checkpointer em memória (sem Postgres)."""
    return grafo.construir().compile(checkpointer=MemorySaver())


def _config(run_id: str) -> dict:
    """Config do run: thread_id = run_id, com recursion_limit folgado."""
    return {"configurable": {"thread_id": run_id}, "recursion_limit": 30}


def _entrada(run_id: str, pedido: str) -> dict:
    """Estado inicial de um run."""
    return {
        "run_id": run_id,
        "autor": "dimi",
        "pedido": pedido,
        "historico": "",
        "passos": 0,
    }


def _rota(proximo: str, instrucao: str = "faça", motivo: str = "porque") -> grafo.Rota:
    """Atalho para montar uma Rota (decisão do supervisor)."""
    return grafo.Rota(proximo=proximo, instrucao=instrucao, motivo=motivo)


# --- Fluxo base: pergunta → tech → responder ---


def test_fluxo_tech_e_resposta(banco, monkeypatch):
    """Supervisor delega ao Tech e depois redige a resposta final."""
    # 1ª decisão: tech; 2ª decisão (de volta ao supervisor): responder.
    decisoes = iter([_rota("tech", "buscar mudanças", "é sobre código"), _rota("responder")])
    monkeypatch.setattr(grafo, "decidir", lambda estado: next(decisoes))
    monkeypatch.setattr(grafo, "redigir", lambda estado: "Resposta final do orq.")
    monkeypatch.setattr(
        grafo.especialistas, "tech", lambda instrucao, run_id: "Relatório do Tech."
    )

    g = _compilar()
    final = g.invoke(_entrada("run-tech", "o que mudou?"), _config("run-tech"))

    assert final["resposta"] == "Resposta final do orq."
    # O relatório do Tech entrou no estado via redutor operator.add.
    assert final["relatorios"] == [{"agente": "tech", "texto": "Relatório do Tech."}]
    # Uma delegação foi contada.
    assert final["passos"] == 1


def test_emite_delegou_e_resposta(banco, monkeypatch):
    """Atividades: `delegou` (de=orq, para=tech) e `resposta` (Reqs 3.2, 3.5)."""
    decisoes = iter([_rota("tech"), _rota("responder")])
    monkeypatch.setattr(grafo, "decidir", lambda estado: next(decisoes))
    monkeypatch.setattr(grafo, "redigir", lambda estado: "Pronto.")
    monkeypatch.setattr(grafo.especialistas, "tech", lambda i, r: "rel tech")

    g = _compilar()
    g.invoke(_entrada("run-log", "pergunta"), _config("run-log"))

    log = [a for a in atividades.listar() if a["run_id"] == "run-log"]
    delegou = [a for a in log if a["tipo"] == "delegou"]
    # Ao menos a delegação orq→tech do supervisor está registrada.
    orq_para_tech = [
        a for a in delegou
        if (a.get("dados") or {}).get("de") == "orq"
        and (a.get("dados") or {}).get("para") == "tech"
    ]
    assert orq_para_tech, "esperava atividade delegou de orq para tech"

    resposta = [a for a in log if a["tipo"] == "resposta"]
    assert len(resposta) == 1
    assert resposta[0]["agente"] == "orq"


# --- Limite de 4 passos (Requirement 3.4) ---


def test_limite_de_quatro_passos(banco, monkeypatch):
    """Se o supervisor sempre delega, o grafo para em 4 passos e responde."""
    # decidir sempre manda para negocios; nunca pede 'responder' por conta própria.
    monkeypatch.setattr(grafo, "decidir", lambda estado: _rota("negocios"))
    monkeypatch.setattr(grafo, "redigir", lambda estado: "Resposta por limite.")
    monkeypatch.setattr(grafo.especialistas, "negocios", lambda i, r: "rel negocios")

    g = _compilar()
    final = g.invoke(_entrada("run-limite", "loop?"), _config("run-limite"))

    # Exatamente 4 delegações a especialistas foram feitas antes de responder.
    assert final["passos"] == grafo.MAX_PASSOS
    assert len(final["relatorios"]) == grafo.MAX_PASSOS
    assert final["resposta"] == "Resposta por limite."


# --- Roteamento agenda → aprovacao → supervisor ---


def _inicio_futuro() -> str:
    """Amanhã, mesmo horário, em ISO 8601 com o offset de São Paulo."""
    return (config.agora() + timedelta(days=1)).replace(microsecond=0).isoformat()


def _proposta(titulo: str = "Semanal Orion", inicio: str | None = None) -> dict:
    """Proposta de reunião de exemplo (início ISO com offset de São Paulo)."""
    return {
        "titulo": titulo,
        "inicio": inicio or _inicio_futuro(),
        "duracao_min": 30,
        "participantes": ["Dimi", "Jullyana"],
        "pauta": ["Onboarding", "Custos"],
    }


def test_fluxo_agenda_pausa_no_interrupt(banco, monkeypatch):
    """Agenda gera proposta e o grafo PAUSA no `interrupt()` (Requirement 6.3)."""
    monkeypatch.setattr(grafo, "decidir", lambda estado: _rota("agenda", "marca a semanal"))
    monkeypatch.setattr(
        grafo.especialistas,
        "propor_reuniao",
        lambda instrucao, run_id: _proposta(),
    )

    g = _compilar()
    g.invoke(_entrada("run-agenda", "marca reunião"), _config("run-agenda"))

    # O grafo não terminou: está aguardando a decisão (snap.next não vazio).
    snap = g.get_state(_config("run-agenda"))
    assert snap.next, "esperava o grafo pausado no interrupt"

    # A aprovação pendente foi registrada de forma idempotente pela chave.
    pendentes = db.consultar("select id, chave, status from aprovacoes")
    assert len(pendentes) == 1
    assert pendentes[0]["status"] == "pendente"

    # Emitiu a atividade `aguardando_aprovacao` com dados.aprovacao_id.
    aguardando = [
        a for a in atividades.listar()
        if a["tipo"] == "aguardando_aprovacao" and a["run_id"] == "run-agenda"
    ]
    assert len(aguardando) == 1
    assert (aguardando[0].get("dados") or {}).get("aprovacao_id") == pendentes[0]["id"]


def test_aprovacao_cria_reuniao_e_links(banco, monkeypatch):
    """Ao aprovar, cria a reunião e devolve links Google/.ics (Requirement 6.4)."""
    decisoes = iter([_rota("agenda", "marca a semanal"), _rota("responder")])
    monkeypatch.setattr(grafo, "decidir", lambda estado: next(decisoes))
    monkeypatch.setattr(grafo, "redigir", lambda estado: "Reunião marcada.")
    monkeypatch.setattr(
        grafo.especialistas, "propor_reuniao", lambda i, r: _proposta()
    )

    g = _compilar()
    g.invoke(_entrada("run-aprova", "marca reunião"), _config("run-aprova"))

    # Retoma o grafo com a decisão de aprovação.
    final = g.invoke(
        Command(resume={"aprovado": True, "por": "dimi"}), _config("run-aprova")
    )

    # A reunião foi persistida.
    reunioes = db.consultar("select id, titulo, criado_por from reunioes")
    assert len(reunioes) == 1
    assert reunioes[0]["titulo"] == "Semanal Orion"
    assert reunioes[0]["criado_por"] == "dimi"

    # O relatório traz os links e menciona quem aprovou.
    textos = " ".join(r["texto"] for r in final["relatorios"])
    assert "aprovada por dimi" in textos
    assert "calendar.google.com" in textos
    assert f"/api/reunioes/{reunioes[0]['id']}.ics" in textos

    # A atividade `concluiu` da Agenda leva dados.google e dados.ics.
    concluiu = [
        a for a in atividades.listar()
        if a["tipo"] == "concluiu" and a["agente"] == "agenda"
        and a["run_id"] == "run-aprova"
    ]
    assert concluiu
    dados = concluiu[-1].get("dados") or {}
    assert "calendar.google.com" in dados.get("google", "")
    assert dados.get("ics", "").endswith(".ics")

    assert final.get("proposta") is None
    assert final["resposta"] == "Reunião marcada."


def test_recusa_nao_cria_reuniao(banco, monkeypatch):
    """Ao recusar, não cria reunião e informa quem recusou (Requirement 6.5)."""
    decisoes = iter([_rota("agenda", "marca a semanal"), _rota("responder")])
    monkeypatch.setattr(grafo, "decidir", lambda estado: next(decisoes))
    monkeypatch.setattr(grafo, "redigir", lambda estado: "Sem reunião, então.")
    monkeypatch.setattr(
        grafo.especialistas, "propor_reuniao", lambda i, r: _proposta()
    )

    g = _compilar()
    g.invoke(_entrada("run-recusa", "marca reunião"), _config("run-recusa"))

    final = g.invoke(
        Command(resume={"aprovado": False, "por": "jullyana"}), _config("run-recusa")
    )

    # Nenhuma reunião criada.
    assert db.consultar("select id from reunioes") == []

    textos = " ".join(r["texto"] for r in final["relatorios"])
    assert "NÃO foi criada" in textos
    assert "jullyana" in textos
    assert final.get("proposta") is None


def test_registro_aprovacao_e_idempotente(banco, monkeypatch):
    """O nó reexecuta ao retomar sem duplicar a aprovação (Requirement 6.3)."""
    decisoes = iter([_rota("agenda", "marca a semanal"), _rota("responder")])
    monkeypatch.setattr(grafo, "decidir", lambda estado: next(decisoes))
    monkeypatch.setattr(grafo, "redigir", lambda estado: "ok")
    monkeypatch.setattr(
        grafo.especialistas, "propor_reuniao", lambda i, r: _proposta()
    )

    g = _compilar()
    g.invoke(_entrada("run-idem", "marca reunião"), _config("run-idem"))
    # 1ª passagem já criou a aprovação e emitiu a atividade.
    assert len(db.consultar("select id from aprovacoes")) == 1

    # Ao retomar, o nó roda de novo (tudo antes do interrupt reexecuta), mas o
    # insert idempotente não cria segunda linha nem reemite a atividade.
    g.invoke(Command(resume={"aprovado": True, "por": "dimi"}), _config("run-idem"))

    assert len(db.consultar("select id from aprovacoes")) == 1
    aguardando = [
        a for a in atividades.listar()
        if a["tipo"] == "aguardando_aprovacao" and a["run_id"] == "run-idem"
    ]
    assert len(aguardando) == 1, "atividade aguardando_aprovacao não pode duplicar"


# --- Proposta inválida e idempotência da reunião ---


def _fluxo_agenda_invalida(monkeypatch, inicio: str, run_id: str):
    """Roda um pedido de reunião cuja proposta tem `inicio` inválido."""
    decisoes = iter([_rota("agenda", "marca a semanal"), _rota("responder")])
    monkeypatch.setattr(grafo, "decidir", lambda estado: next(decisoes))
    monkeypatch.setattr(grafo, "redigir", lambda estado: "Preciso de outra data.")
    monkeypatch.setattr(
        grafo.especialistas, "propor_reuniao", lambda i, r: _proposta(inicio=inicio)
    )
    g = _compilar()
    final = g.invoke(_entrada(run_id, "marca reunião"), _config(run_id))
    return g, final


def test_data_invalida_nao_pausa(banco, monkeypatch):
    """`inicio` fora do ISO 8601: a Agenda explica e o grafo NÃO pausa."""
    g, final = _fluxo_agenda_invalida(monkeypatch, "terça às 15h", "run-invalida")

    assert not g.get_state(_config("run-invalida")).next
    assert db.consultar("select id from aprovacoes") == []
    assert final["resposta"] == "Preciso de outra data."
    textos = " ".join(r["texto"] for r in final["relatorios"])
    assert "Não propus" in textos and "ISO 8601" in textos


def test_data_passada_nao_pausa(banco, monkeypatch):
    """`inicio` no passado também não vai para aprovação."""
    g, final = _fluxo_agenda_invalida(
        monkeypatch, "2020-01-07T15:00:00-03:00", "run-passada"
    )

    assert not g.get_state(_config("run-passada")).next
    assert db.consultar("select id from aprovacoes") == []
    assert "já passou" in " ".join(r["texto"] for r in final["relatorios"])


def test_data_sem_fuso_nao_pausa(banco, monkeypatch):
    """`inicio` sem offset de fuso é recusado antes da aprovação."""
    g, final = _fluxo_agenda_invalida(monkeypatch, "2099-01-07T15:00:00", "run-sem-fuso")

    assert not g.get_state(_config("run-sem-fuso")).next
    assert "fuso" in " ".join(r["texto"] for r in final["relatorios"])


def test_aprovacao_com_data_invalida_explica_sem_criar(banco, monkeypatch):
    """Se a data chegar inválida à aprovação, o relatório explica e nada é criado."""
    decisoes = iter([_rota("agenda", "marca a semanal"), _rota("responder")])
    monkeypatch.setattr(grafo, "decidir", lambda estado: next(decisoes))
    monkeypatch.setattr(grafo, "redigir", lambda estado: "ok")
    monkeypatch.setattr(
        grafo.especialistas, "propor_reuniao", lambda i, r: _proposta(inicio="lixo")
    )
    monkeypatch.setattr(grafo.especialistas, "problema_inicio", lambda inicio: None)

    g = _compilar()
    g.invoke(_entrada("run-lixo", "marca reunião"), _config("run-lixo"))
    final = g.invoke(
        Command(resume={"aprovado": True, "por": "dimi"}), _config("run-lixo")
    )

    assert db.consultar("select id from reunioes") == []
    textos = " ".join(r["texto"] for r in final["relatorios"])
    assert "NÃO foi criada" in textos and "inválida" in textos


def test_criar_reuniao_e_idempotente_pela_chave(banco):
    """Criar a reunião duas vezes com a mesma chave reaproveita a primeira."""
    proposta = _proposta()
    inicio, fim = grafo._instantes_reuniao(proposta)

    primeira = grafo._criar_reuniao(proposta, "dimi", "run-x", "run-x:1", inicio, fim)
    segunda = grafo._criar_reuniao(proposta, "dimi", "run-x", "run-x:1", inicio, fim)

    assert primeira["id"] == segunda["id"]
    assert len(db.consultar("select id from reunioes")) == 1


# --- Links de calendário (unit, sem banco nem modelo) ---


def test_link_google_formata_datas_utc_e_encode():
    """O link do Google usa datas UTC (YYYYMMDDTHHMMSSZ) e faz URL-encode."""
    proposta = _proposta(titulo="Reunião & Pauta", inicio="2026-09-29T15:00:00-03:00")
    inicio, fim = grafo._instantes_reuniao(proposta)
    url = grafo.link_google(proposta, inicio, fim)

    # 15:00 -03:00 == 18:00Z; +30 min == 18:30Z.
    assert "dates=20260929T180000Z/20260929T183000Z" in url
    assert url.startswith(
        "https://calendar.google.com/calendar/render?action=TEMPLATE"
    )
    # O título com "&" e acento foi URL-encoded (não vaza como separador).
    assert "text=Reuni%C3%A3o%20%26%20Pauta" in url
    # A pauta (lista) virou details com itens por linha, encodados.
    assert "details=Onboarding%0ACustos" in url


def test_instantes_reuniao_calcula_fim_pela_duracao():
    """O fim é o início + duracao_min (default 60 se ausente)."""
    inicio, fim = grafo._instantes_reuniao(_proposta())
    assert (fim - inicio).total_seconds() == 30 * 60

    inicio2, fim2 = grafo._instantes_reuniao(
        {"inicio": "2026-09-29T15:00:00-03:00"}
    )
    assert (fim2 - inicio2).total_seconds() == 60 * 60


def test_link_ics_referencia_a_rota():
    """O link .ics referencia a rota GET /api/reunioes/<id>.ics (task 7)."""
    assert grafo.link_ics(42) == "/api/reunioes/42.ics"


# --- Conversa simples: responder direto, sem especialista ---


def test_conversa_simples_responde_direto(banco, monkeypatch):
    """Se o supervisor escolhe 'responder' de cara, não delega a ninguém."""
    monkeypatch.setattr(grafo, "decidir", lambda estado: _rota("responder"))
    monkeypatch.setattr(grafo, "redigir", lambda estado: "Oi! Tudo certo por aqui.")

    g = _compilar()
    final = g.invoke(_entrada("run-simples", "bom dia"), _config("run-simples"))

    assert final["resposta"] == "Oi! Tudo certo por aqui."
    assert final.get("passos", 0) == 0
    assert final.get("relatorios", []) == []


# --- decidir/redigir usam o modelo isolado (substituível) ---


def test_decidir_usa_saida_estruturada(monkeypatch):
    """`decidir` pede saída estruturada `Rota` ao modelo principal (Req 3.1)."""

    class FakeEstruturado:
        def __init__(self, rota: Any) -> None:
            self._rota = rota
            self.modelo_saida: Any = None

        def with_structured_output(self, modelo: Any) -> "FakeEstruturado":
            self.modelo_saida = modelo
            return self

        def invoke(self, msgs: Any) -> Any:
            return self._rota

    fake = FakeEstruturado(_rota("tech"))
    monkeypatch.setattr(grafo.llm, "principal", lambda: fake)

    rota = grafo.decidir({"pedido": "algo", "autor": "dimi"})

    assert isinstance(rota, grafo.Rota)
    assert rota.proximo == "tech"
    assert fake.modelo_saida is grafo.Rota
