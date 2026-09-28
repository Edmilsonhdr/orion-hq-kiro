"""Testes de execução de um run (task 6.3).

Exercitam `execucao.conversar` e `execucao.decidir_aprovacao` de ponta a ponta,
sem tocar na API da Anthropic: substituímos as funções isoladas do grafo
(`grafo.decidir`, `grafo.redigir`) e os especialistas
(`grafo.especialistas.tech/negocios/propor_reuniao`) por fakes.

O checkpointer é o Postgres efêmero da fixture `banco` (o mesmo caminho do app,
via `grafo.grafo_com_checkpoint()`), para que o estado sobreviva entre a pausa
no `interrupt()` e a retomada em `decidir_aprovacao` — como acontece em
produção (Requirement 6.7).

Cobrem os cenários obrigatórios do Requirement 11.1 relativos a este módulo:
- pergunta → Tech → resposta (run completo com mensagem do Orquestrador);
- atalho `/nota` (registra nota, sem chamar o modelo, resposta correta);
- reunião → interrupt → aprovar (cria reunião, resposta salva);
- recusar (não cria reunião, informa quem recusou);
- dupla decisão concorrente (a segunda recebe "ja_decidida");
- falha no run → mensagem amigável e atividade `erro`.
"""

from _orion import atividades, db, execucao, grafo


def _rota(proximo: str, instrucao: str = "faça", motivo: str = "porque") -> grafo.Rota:
    """Atalho para montar uma Rota (decisão do supervisor)."""
    return grafo.Rota(proximo=proximo, instrucao=instrucao, motivo=motivo)


def _proposta(titulo: str = "Semanal Orion") -> dict:
    """Proposta de reunião de exemplo (início ISO com offset de São Paulo)."""
    return {
        "titulo": titulo,
        "inicio": "2026-09-29T15:00:00-03:00",
        "duracao_min": 30,
        "participantes": ["Dimi", "Jullyana"],
        "pauta": ["Onboarding", "Custos"],
    }


# --- Fluxo base: pergunta → Tech → resposta ---


def test_conversar_pergunta_tech_resposta(banco, monkeypatch):
    """Uma pergunta delega ao Tech e salva a resposta do Orquestrador."""
    decisoes = iter([_rota("tech", "buscar mudanças"), _rota("responder")])
    monkeypatch.setattr(grafo, "decidir", lambda estado: next(decisoes))
    monkeypatch.setattr(grafo, "redigir", lambda estado: "Resposta final do orq.")
    monkeypatch.setattr(
        grafo.especialistas, "tech", lambda instrucao, run_id: "Relatório do Tech."
    )

    resultado = execucao.conversar("dimi", "o que mudou?")

    assert resultado["status"] == "respondido"
    assert resultado["resposta"] == "Resposta final do orq."

    # A mensagem do usuário e a resposta do Orquestrador foram salvas.
    msgs = db.consultar("select autor, texto, run_id from mensagens order by id")
    assert [m["autor"] for m in msgs] == ["dimi", execucao.AUTOR_ORQ]
    assert msgs[0]["texto"] == "o que mudou?"
    assert msgs[1]["texto"] == "Resposta final do orq."
    # A resposta do Orquestrador está vinculada ao run_id (Requirement 2.2).
    assert msgs[1]["run_id"] == resultado["run_id"]


def test_conversar_gera_run_id_e_historico(banco, monkeypatch):
    """O run recebe um run_id próprio e o historico vai para o estado (Req 2.1)."""
    capturado: dict = {}

    def _decidir(estado):
        capturado["historico"] = estado.get("historico")
        capturado["run_id"] = estado.get("run_id")
        return _rota("responder")

    monkeypatch.setattr(grafo, "decidir", _decidir)
    monkeypatch.setattr(grafo, "redigir", lambda estado: "Oi!")

    # Uma mensagem anterior para o histórico ter conteúdo.
    db.salvar_mensagem("jullyana", "mensagem antiga")

    resultado = execucao.conversar("dimi", "bom dia")

    assert resultado["run_id"]
    assert capturado["run_id"] == resultado["run_id"]
    # O histórico usado inclui a mensagem antiga e a atual (últimas 12).
    assert "mensagem antiga" in capturado["historico"]
    assert "bom dia" in capturado["historico"]


# --- Atalho /nota ---


def test_conversar_nota_registra_sem_modelo(banco, monkeypatch):
    """`/nota` grava no changelog (fonte 'nota') sem chamar o modelo (Req 2.5)."""
    # Se o grafo for chamado, o teste falha: /nota não pode acionar o modelo.
    def _explode(*args, **kwargs):
        raise AssertionError("o atalho /nota não deve rodar o grafo")

    monkeypatch.setattr(grafo, "grafo_com_checkpoint", _explode)

    resultado = execucao.conversar("dimi", "/nota decidimos usar Neon")

    assert resultado["status"] == "nota"
    assert resultado["resposta"] == "Anotado no histórico do projeto."

    # A nota entrou no changelog como fonte 'nota'.
    notas = db.consultar(
        "select fonte, referencia, resumo from changelog where fonte = 'nota'"
    )
    assert len(notas) == 1
    assert notas[0]["referencia"] is None
    assert notas[0]["resumo"] == "decidimos usar Neon"

    # A mensagem do usuário e a confirmação do Orquestrador estão no chat.
    msgs = db.consultar("select autor, texto from mensagens order by id")
    assert [m["autor"] for m in msgs] == ["dimi", execucao.AUTOR_ORQ]
    assert msgs[1]["texto"] == "Anotado no histórico do projeto."


def test_conversar_nota_vazia_nao_registra(banco, monkeypatch):
    """`/nota ` sem conteúdo não grava no changelog e avisa o usuário."""
    monkeypatch.setattr(
        grafo,
        "grafo_com_checkpoint",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("não rodar grafo")),
    )

    resultado = execucao.conversar("dimi", "/nota    ")

    assert resultado["status"] == "nota"
    assert "vazia" in resultado["resposta"].lower()
    assert db.consultar("select id from changelog where fonte = 'nota'") == []


# --- Reunião → interrupt → aprovar ---


def test_aprovar_cria_reuniao_e_salva_resposta(banco, monkeypatch):
    """Aprovar retoma o grafo, cria a reunião e salva a resposta (Reqs 6.4, 2.2)."""
    decisoes = iter([_rota("agenda", "marca a semanal"), _rota("responder")])
    monkeypatch.setattr(grafo, "decidir", lambda estado: next(decisoes))
    monkeypatch.setattr(grafo, "redigir", lambda estado: "Reunião marcada.")
    monkeypatch.setattr(
        grafo.especialistas, "propor_reuniao", lambda i, r: _proposta()
    )

    # 1. Pedido: o grafo pausa aguardando aprovação.
    resultado = execucao.conversar("dimi", "marca uma reunião")
    assert resultado["status"] == "aguardando_aprovacao"

    # A aprovação pendente foi registrada.
    pendente = db.um("select id, status from aprovacoes")
    assert pendente is not None
    assert pendente["status"] == "pendente"

    # Ainda não há resposta do Orquestrador no chat.
    assert db.consultar(
        "select id from mensagens where autor = %s", (execucao.AUTOR_ORQ,)
    ) == []

    # 2. Aprovação: retoma o grafo e cria a reunião.
    decisao = execucao.decidir_aprovacao(pendente["id"], "dimi", True)
    assert decisao["status"] == "respondido"
    assert decisao["resposta"] == "Reunião marcada."

    # A reunião foi persistida.
    reunioes = db.consultar("select titulo, criado_por from reunioes")
    assert len(reunioes) == 1
    assert reunioes[0]["titulo"] == "Semanal Orion"

    # A aprovação ficou como aprovada, por quem decidiu.
    aprov = db.um("select status, decidido_por from aprovacoes")
    assert aprov["status"] == "aprovada"
    assert aprov["decidido_por"] == "dimi"

    # A resposta do Orquestrador foi salva vinculada ao run.
    resposta = db.um(
        "select texto, run_id from mensagens where autor = %s", (execucao.AUTOR_ORQ,)
    )
    assert resposta["texto"] == "Reunião marcada."


# --- Recusar ---


def test_recusar_nao_cria_reuniao_e_informa(banco, monkeypatch):
    """Recusar não cria reunião e o relatório informa quem recusou (Req 6.5)."""
    decisoes = iter([_rota("agenda", "marca a semanal"), _rota("responder")])
    monkeypatch.setattr(grafo, "decidir", lambda estado: next(decisoes))
    # A resposta final reflete o relatório da Agenda (recusa).
    monkeypatch.setattr(
        grafo,
        "redigir",
        lambda estado: " ".join(r["texto"] for r in estado.get("relatorios", [])),
    )
    monkeypatch.setattr(
        grafo.especialistas, "propor_reuniao", lambda i, r: _proposta()
    )

    execucao.conversar("dimi", "marca uma reunião")
    pendente = db.um("select id from aprovacoes")

    decisao = execucao.decidir_aprovacao(pendente["id"], "jullyana", False)

    assert decisao["status"] == "respondido"
    assert db.consultar("select id from reunioes") == []
    assert "jullyana" in decisao["resposta"]
    assert "NÃO foi criada" in decisao["resposta"]

    aprov = db.um("select status, decidido_por from aprovacoes")
    assert aprov["status"] == "recusada"
    assert aprov["decidido_por"] == "jullyana"


# --- Dupla decisão concorrente (Requirement 6.6) ---


def test_dupla_decisao_segunda_recebe_ja_decidida(banco, monkeypatch):
    """Se os dois decidem, só a primeira vale; a segunda recebe 'ja_decidida'."""
    decisoes = iter([_rota("agenda", "marca a semanal"), _rota("responder")])
    monkeypatch.setattr(grafo, "decidir", lambda estado: next(decisoes))
    monkeypatch.setattr(grafo, "redigir", lambda estado: "Feito.")
    monkeypatch.setattr(
        grafo.especialistas, "propor_reuniao", lambda i, r: _proposta()
    )

    execucao.conversar("dimi", "marca uma reunião")
    pendente = db.um("select id from aprovacoes")

    # Primeira decisão vale.
    primeira = execucao.decidir_aprovacao(pendente["id"], "dimi", True)
    assert primeira["status"] == "respondido"

    # Segunda decisão sobre a mesma aprovação perde (update atômico).
    segunda = execucao.decidir_aprovacao(pendente["id"], "jullyana", False)
    assert segunda["status"] == "ja_decidida"

    # A reunião só foi criada uma vez, e quem decidiu foi o primeiro.
    assert len(db.consultar("select id from reunioes")) == 1
    aprov = db.um("select status, decidido_por from aprovacoes")
    assert aprov["status"] == "aprovada"
    assert aprov["decidido_por"] == "dimi"


def test_decidir_aprovacao_id_inexistente(banco):
    """Decidir uma aprovação que não existe também retorna 'ja_decidida'."""
    assert execucao.decidir_aprovacao(9999, "dimi", True) == {"status": "ja_decidida"}


# --- Tratamento de erro (Requirement 2.7) ---


def test_conversar_erro_no_run_responde_amigavel(banco, monkeypatch):
    """Falha no run vira mensagem curta no chat + atividade `erro`, sem stack."""
    def _decidir_quebra(estado):
        raise RuntimeError("falha simulada no modelo")

    monkeypatch.setattr(grafo, "decidir", _decidir_quebra)

    resultado = execucao.conversar("dimi", "pergunta que quebra")

    assert resultado["status"] == "erro"
    assert resultado["resposta"] == execucao.MSG_ERRO

    # A mensagem amigável foi salva no chat como Orquestrador.
    resposta = db.um(
        "select texto from mensagens where autor = %s", (execucao.AUTOR_ORQ,)
    )
    assert resposta["texto"] == execucao.MSG_ERRO

    # Registrou a atividade `erro` para o run.
    erros = [
        a for a in atividades.listar()
        if a["tipo"] == "erro" and a["run_id"] == resultado["run_id"]
    ]
    assert erros
