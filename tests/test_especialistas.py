"""Testes de `_orion/especialistas.py` (task 5.2).

Exercitam o loop de ferramentas próprio dos especialistas sem tocar na API da
Anthropic: `llm.principal` é substituído por um fake que devolve `AIMessage`s
em sequência (design.md, Testing Strategy). O fake implementa `bind_tools`
(retorna a si mesmo) e `invoke` (devolve o próximo `AIMessage` da fila), de
modo que o loop real é exercitado de ponta a ponta.

As atividades são gravadas de verdade no Postgres efêmero da fixture `banco`
(conftest.py), então os testes inspecionam o log via `atividades.listar()`.
"""

from typing import Any

import pytest
from langchain_core.messages import AIMessage

from _orion import atividades, especialistas, ferramentas, llm


class ModeloFake:
    """Fake de `ChatAnthropic` para o loop de ferramentas.

    Devolve, a cada `invoke`, o próximo `AIMessage` de `respostas`. `bind_tools`
    apenas registra as ferramentas e retorna a si mesmo (o loop real chama
    `bind_tools(...).invoke(...)`). Guarda as mensagens recebidas para inspeção.
    """

    def __init__(self, respostas: list[AIMessage]) -> None:
        self._respostas = list(respostas)
        self.chamadas = 0
        self.ferramentas: Any = None
        self.ultimas_msgs: list[Any] | None = None

    def bind_tools(self, ferramentas: Any) -> "ModeloFake":
        self.ferramentas = ferramentas
        return self

    def invoke(self, msgs: list[Any]) -> AIMessage:
        self.ultimas_msgs = list(msgs)
        self.chamadas += 1
        if self._respostas:
            return self._respostas.pop(0)
        # Sem mais respostas programadas: responde sem tool_calls (encerra).
        return AIMessage(content="fim")


def _ai_com_ferramenta(nome: str, args: dict, *, id_chamada: str = "call-1") -> AIMessage:
    """AIMessage que pede uma ferramenta (uma tool call)."""
    return AIMessage(
        content="",
        tool_calls=[{"name": nome, "args": args, "id": id_chamada, "type": "tool_call"}],
    )


def _ai_final(texto: str) -> AIMessage:
    """AIMessage de resposta final (sem tool_calls)."""
    return AIMessage(content=texto)


def _instalar_modelo(monkeypatch: pytest.MonkeyPatch, fake: Any) -> None:
    """Substitui `llm.principal` pelo fake (nenhuma chamada à Anthropic)."""
    monkeypatch.setattr(llm, "principal", lambda: fake)


# --- Fluxo do enunciado: uma ferramenta e depois responde ---


def test_tech_chama_ferramenta_e_depois_responde(banco, monkeypatch):
    """`tech` faz uma chamada de ferramenta e depois responde (fluxo base)."""
    fake = ModeloFake(
        [
            _ai_com_ferramenta("buscar_changelog", {"consulta": "onboarding"}),
            _ai_final("Não encontrei nada sobre onboarding no changelog."),
        ]
    )
    _instalar_modelo(monkeypatch, fake)

    resposta = especialistas.tech("O que mudou no onboarding?", "run-1")

    assert resposta == "Não encontrei nada sobre onboarding no changelog."
    # Duas voltas: uma pediu ferramenta, a outra respondeu.
    assert fake.chamadas == 2


def test_rodar_com_ferramentas_emite_ferramenta_com_nome_e_args(banco, monkeypatch):
    """Atividade `ferramenta` traz nome e argumentos (Requirement 4.4)."""
    fake = ModeloFake(
        [
            _ai_com_ferramenta("buscar_changelog", {"consulta": "onboarding"}),
            _ai_final("Resumo final."),
        ]
    )
    _instalar_modelo(monkeypatch, fake)

    especialistas.tech("O que mudou?", "run-ferramenta")

    log = atividades.listar()
    tipos = [a["tipo"] for a in log if a["run_id"] == "run-ferramenta"]
    assert "inicio" in tipos
    assert "pensando" in tipos
    assert "ferramenta" in tipos
    assert "concluiu" in tipos

    ferramenta_ativs = [
        a for a in log if a["run_id"] == "run-ferramenta" and a["tipo"] == "ferramenta"
    ]
    assert len(ferramenta_ativs) == 1
    detalhe = ferramenta_ativs[0]["detalhe"]
    assert "buscar_changelog" in detalhe
    assert "consulta=" in detalhe
    assert "onboarding" in detalhe


def test_concluiu_registra_texto_final(banco, monkeypatch):
    """A atividade `concluiu` guarda o começo do texto final."""
    fake = ModeloFake([_ai_final("Resposta direta sem ferramentas.")])
    _instalar_modelo(monkeypatch, fake)

    especialistas.tech("pergunta simples", "run-concluiu")

    log = atividades.listar()
    concluiu = [
        a for a in log if a["run_id"] == "run-concluiu" and a["tipo"] == "concluiu"
    ]
    assert len(concluiu) == 1
    assert "Resposta direta sem ferramentas." in concluiu[0]["detalhe"]


# --- Limite de voltas ---


class ModeloSemprePedeFerramenta:
    """Fake que SEMPRE pede uma ferramenta (para testar o limite de voltas)."""

    def __init__(self) -> None:
        self.chamadas = 0

    def bind_tools(self, ferramentas: Any) -> "ModeloSemprePedeFerramenta":
        return self

    def invoke(self, msgs: list[Any]) -> AIMessage:
        self.chamadas += 1
        return AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "buscar_changelog",
                    "args": {"consulta": "x"},
                    "id": f"call-{self.chamadas}",
                    "type": "tool_call",
                }
            ],
        )


def test_respeita_limite_max_voltas(banco, monkeypatch):
    """Um modelo que sempre pede ferramenta não roda infinitamente."""
    fake = ModeloSemprePedeFerramenta()
    _instalar_modelo(monkeypatch, fake)

    resposta = especialistas.rodar_com_ferramentas(
        "tech",
        "sistema",
        "instrucao",
        ferramentas.FERRAMENTAS_TECH,
        "run-limite",
        max_voltas=6,
    )

    # Invocou o modelo exatamente max_voltas vezes e encerrou.
    assert fake.chamadas == 6
    assert isinstance(resposta, str)


# --- Erro numa ferramenta não derruba o loop ---


def test_erro_em_ferramenta_vira_texto_e_nao_derruba(banco, monkeypatch):
    """Erro ao executar uma ferramenta vira texto para o modelo e o loop segue."""
    fake = ModeloFake(
        [
            _ai_com_ferramenta("explode", {"x": 1}),
            _ai_final("Segui mesmo com o erro."),
        ]
    )
    _instalar_modelo(monkeypatch, fake)

    from langchain_core.tools import tool

    @tool
    def explode(x: int) -> str:
        """Ferramenta que sempre falha (para testar tratamento de erro)."""
        raise RuntimeError("falha proposital")

    resposta = especialistas.rodar_com_ferramentas(
        "tech",
        "sistema",
        "instrucao",
        (explode,),
        "run-erro",
        max_voltas=6,
    )

    # O loop não quebrou: continuou e devolveu a resposta final.
    assert resposta == "Segui mesmo com o erro."
    assert fake.chamadas == 2


# --- negocios usa o conjunto com registrar_decisao ---


def test_negocios_usa_conjunto_com_registrar_decisao(banco, monkeypatch):
    """`negocios` liga o conjunto de ferramentas que inclui registrar_decisao."""
    fake = ModeloFake([_ai_final("ok")])
    _instalar_modelo(monkeypatch, fake)

    especialistas.negocios("qualquer coisa", "run-negocios")

    # bind_tools recebeu o conjunto do Negócios (com registrar_decisao).
    nomes = {getattr(f, "name", None) for f in fake.ferramentas}
    assert "registrar_decisao" in nomes
    assert "buscar_changelog" in nomes
    assert "mudancas_recentes" in nomes


# --- Agenda: propor_reuniao com saída estruturada (task 5.3) ---


class ModeloEstruturadoFake:
    """Fake de `ChatAnthropic` para saída estruturada (`with_structured_output`).

    `with_structured_output(Modelo)` registra o modelo pedido e retorna a si
    mesmo; `invoke(msgs)` guarda as mensagens recebidas (para inspeção) e
    devolve a `proposta` fixa fornecida na construção. Nenhuma chamada à
    Anthropic acontece.
    """

    def __init__(self, proposta: Any) -> None:
        self._proposta = proposta
        self.modelo_saida: Any = None
        self.ultimas_msgs: list[Any] | None = None
        self.chamadas = 0

    def with_structured_output(self, modelo: Any) -> "ModeloEstruturadoFake":
        self.modelo_saida = modelo
        return self

    def invoke(self, msgs: list[Any]) -> Any:
        self.ultimas_msgs = list(msgs)
        self.chamadas += 1
        return self._proposta


def _proposta_fixa() -> especialistas.PropostaReuniao:
    """Proposta de reunião fixa (não depende do modelo real)."""
    from datetime import timedelta

    from _orion import config

    inicio = (config.agora() + timedelta(days=1)).replace(microsecond=0)
    return especialistas.PropostaReuniao(
        titulo="Semanal Orion",
        inicio=inicio.isoformat(),
        duracao_min=45,
        participantes=["Dimi", "Jullyana"],
        pauta=["Revisar mudanças recentes", "Próximos passos"],
    )


def _texto_das_msgs(msgs: list[Any]) -> str:
    """Concatena o conteúdo de todas as mensagens enviadas ao modelo."""
    return "\n".join(str(getattr(m, "content", m)) for m in msgs)


def test_propor_reuniao_retorna_dict_estruturado(banco, monkeypatch):
    """`propor_reuniao` devolve um dict com as chaves esperadas (Req 6.1)."""
    fake = ModeloEstruturadoFake(_proposta_fixa())
    _instalar_modelo(monkeypatch, fake)

    proposta = especialistas.propor_reuniao("marca a semanal pra terça", "run-agenda")

    assert isinstance(proposta, dict)
    for chave in ("titulo", "inicio", "duracao_min", "participantes", "pauta"):
        assert chave in proposta
    assert proposta["titulo"] == "Semanal Orion"
    assert proposta["participantes"] == ["Dimi", "Jullyana"]
    assert isinstance(proposta["pauta"], list)
    # with_structured_output recebeu o modelo PropostaReuniao.
    assert fake.modelo_saida is especialistas.PropostaReuniao


def test_propor_reuniao_inicio_iso_com_offset(banco, monkeypatch):
    """O `inicio` retornado é ISO 8601 com offset de fuso (Req 6.2)."""
    fake = ModeloEstruturadoFake(_proposta_fixa())
    _instalar_modelo(monkeypatch, fake)

    proposta = especialistas.propor_reuniao("amanhã de tarde", "run-iso")

    from datetime import datetime

    parsed = datetime.fromisoformat(proposta["inicio"])
    assert parsed.utcoffset() is not None  # tem offset de fuso


def test_propor_reuniao_passa_mudancas_7_dias_ao_modelo(banco, monkeypatch):
    """O contexto das mudanças dos últimos 7 dias vai no prompt (Req 6.1)."""
    # Insere um item recente no changelog; seu título deve aparecer no contexto.
    db = __import__("_orion", fromlist=["db"]).db
    db.um(
        """
        insert into changelog (fonte, referencia, titulo, resumo, url, autor)
        values ('github', 'PR #77', 'Fluxo de pagamento revisado', 'Ajustes no checkout.', null, null)
        returning id
        """,
    )

    fake = ModeloEstruturadoFake(_proposta_fixa())
    _instalar_modelo(monkeypatch, fake)

    especialistas.propor_reuniao("monta a pauta da semanal", "run-contexto")

    assert fake.ultimas_msgs is not None
    enviado = _texto_das_msgs(fake.ultimas_msgs)
    # O título do item recente foi injetado no contexto da pauta.
    assert "Fluxo de pagamento revisado" in enviado
    # E a instrução do humano também foi enviada.
    assert "monta a pauta da semanal" in enviado


def test_propor_reuniao_emite_atividades_agenda(banco, monkeypatch):
    """Emite `inicio` e `concluiu` do agente `agenda` (observabilidade)."""
    fake = ModeloEstruturadoFake(_proposta_fixa())
    _instalar_modelo(monkeypatch, fake)

    especialistas.propor_reuniao("marca uma call", "run-log-agenda")

    log = atividades.listar()
    do_run = [a for a in log if a["run_id"] == "run-log-agenda"]
    tipos = [a["tipo"] for a in do_run]
    assert "inicio" in tipos
    assert "concluiu" in tipos
    # Todas as atividades são do agente agenda.
    assert all(a["agente"] == "agenda" for a in do_run)
