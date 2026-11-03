"""Testes do cadastro de agentes (tela Agentes): módulo, roteamento dinâmico no grafo e rotas.

Nenhum teste chama a Anthropic: `grafo.decidir`, `grafo.redigir`, `especialistas.dinamico` e
`agentes.rascunho` são substituídos por fakes. Os nativos (seed do schema) são restaurados após cada teste.
"""

import importlib

import pytest
from fastapi.testclient import TestClient
from langgraph.checkpoint.memory import MemorySaver

from _orion import agentes, atividades, db, especialistas, grafo


@pytest.fixture()
def cadastro(banco):
    def limpar():
        db.executar("delete from agentes where not sistema")
        db.executar("update agentes set ativo = true, instrucoes = '' where sistema")

    limpar()
    yield
    limpar()


def _novo(**extra):
    dados = {
        "nome": "Lúcio",
        "papel": "Pesquisa de mercado",
        "descricao": "pesquisa de concorrentes e mercado",
        "instrucoes": "Pesquise e resuma.",
    }
    dados.update(extra)
    return dados


# --- Módulo ---


def test_nativos_vem_do_seed(cadastro):
    ids = {a["id"] for a in agentes.listar()}
    assert ids >= set(agentes.NATIVOS)


def test_criar_gera_id_sem_acento_e_aplica_padroes(cadastro):
    a = agentes.criar(_novo(), "dimi")
    assert a["id"] == "lucio"
    assert a["sistema"] is False and a["ativo"] is True
    assert a["modelo"] == "sonnet" and a["ferramentas"] == []
    assert a["criado_por"] == "dimi"


def test_id_nao_colide_com_nativo_nem_com_outro(cadastro):
    a = agentes.criar(_novo(nome="Tech"), "dimi")
    b = agentes.criar(_novo(nome="Tech"), "dimi")
    assert a["id"] != "tech" and b["id"] != a["id"]


@pytest.mark.parametrize(
    "campo,valor",
    [("nome", ""), ("cor", "azul"), ("sala", "Cozinha"), ("modelo", "gpt"), ("ferramentas", ["apagar_tudo"])],
)
def test_validacoes_do_cadastro(cadastro, campo, valor):
    with pytest.raises(agentes.ErroAgente):
        agentes.criar(_novo(**{campo: valor}), "dimi")


def test_exige_descricao_e_instrucoes(cadastro):
    with pytest.raises(agentes.ErroAgente):
        agentes.criar(_novo(descricao=""), "dimi")
    with pytest.raises(agentes.ErroAgente):
        agentes.criar(_novo(instrucoes=""), "dimi")


def test_ferramenta_com_efeito_forca_aprovacao(cadastro):
    a = agentes.criar(_novo(ferramentas=["propor_doc"], exige_aprovacao=False), "dimi")
    assert a["exige_aprovacao"] is True
    b = agentes.criar(_novo(nome="Leitor", ferramentas=["buscar_docs"], exige_aprovacao=False), "dimi")
    assert b["exige_aprovacao"] is False
    c = agentes.atualizar(b["id"], {"ferramentas": ["propor_negocio"]})
    assert c["exige_aprovacao"] is True
    d = agentes.atualizar(a["id"], {"exige_aprovacao": False})
    assert d["exige_aprovacao"] is True


def test_limite_de_agentes_ativos_criados(cadastro):
    for i in range(agentes.MAX_DINAMICOS_ATIVOS):
        agentes.criar(_novo(nome=f"Agente {i}"), "dimi")
    with pytest.raises(agentes.ErroAgente):
        agentes.criar(_novo(nome="Um a mais"), "dimi")
    # Pausar um libera vaga; reativar acima do teto é recusado.
    agentes.atualizar("agente_0", {"ativo": False})
    extra = agentes.criar(_novo(nome="Um a mais"), "dimi")
    with pytest.raises(agentes.ErroAgente):
        agentes.atualizar("agente_0", {"ativo": True})
    assert extra["ativo"] is True


def test_nativo_edita_so_o_permitido(cadastro):
    a = agentes.atualizar("tech", {"nome": "Tobias II", "instrucoes": "Prefira PRs recentes."})
    assert a["nome"] == "Tobias II"
    # Modelo e ferramentas de nativo são ignorados (ficam no código).
    b = agentes.atualizar("tech", {"modelo": "haiku", "ferramentas": ["propor_doc"]})
    assert b["modelo"] == "sonnet" and b["ferramentas"] == []
    with pytest.raises(agentes.ErroAgente):
        agentes.atualizar("vigia", {"instrucoes": "algo"})
    with pytest.raises(agentes.ErroAgente):
        agentes.atualizar("orq", {"ativo": False})
    with pytest.raises(agentes.ErroAgente):
        agentes.remover("tech")


def test_remover_e_inexistente(cadastro):
    a = agentes.criar(_novo(), "dimi")
    agentes.remover(a["id"])
    assert agentes.obter(a["id"]) is None
    with pytest.raises(agentes.AgenteNaoEncontrado):
        agentes.remover(a["id"])
    with pytest.raises(agentes.AgenteNaoEncontrado):
        agentes.atualizar("nao_existe", {"nome": "x"})


def test_roteaveis_so_ativos_e_sem_orq_e_work(cadastro):
    agentes.criar(_novo(), "dimi")
    ids = {a["id"] for a in agentes.roteaveis()}
    assert ids == {"tech", "agenda", "negocios", "vigia", "lucio"}
    agentes.atualizar("tech", {"ativo": False})
    assert "tech" not in {a["id"] for a in agentes.roteaveis()}


def test_instrucoes_extras_entram_no_prompt_do_nativo(cadastro):
    assert agentes.instrucoes_extras("tech") == ""
    agentes.atualizar("tech", {"instrucoes": "Sempre cite o PR."})
    assert "Sempre cite o PR." in especialistas._prompt_tech()
    assert "Sempre cite o PR." not in especialistas._prompt_negocios()


def test_ferramentas_do_ignora_ids_fora_do_catalogo():
    tools = agentes.ferramentas_do({"ferramentas": ["buscar_docs", "inexistente"]})
    assert {t.name for t in tools} == {"buscar_documentos", "ler_documento"}


def test_catalogo_marca_apenas_propor_como_efeito():
    efeitos = {c["id"] for c in agentes.catalogo() if c["efeito"]}
    assert efeitos == {"propor_doc", "propor_negocio"}


def test_rascunho_sanitiza_catalogo(monkeypatch):
    fake = agentes.RascunhoAgente(
        nome="Lúcio", papel="Pesquisa", descricao="pesquisa", instrucoes="faça",
        ferramentas=["buscar_docs", "rm_rf", "buscar_docs"], modelo="gpt-9",
    )
    monkeypatch.setattr(agentes.llm, "estruturado", lambda *a, **k: (fake, 10))
    monkeypatch.setattr(agentes.llm, "principal", lambda: object())
    r = agentes.rascunho("um agente de pesquisa")
    assert r["ferramentas"] == ["buscar_docs"] and r["modelo"] == "sonnet"


# --- Grafo ---


def _g():
    return grafo.construir().compile(checkpointer=MemorySaver())


def _cfg(run):
    return {"configurable": {"thread_id": run}, "recursion_limit": 30}


def _entrada(run):
    return {"run_id": run, "autor": "dimi", "pedido": "pesquise concorrentes", "historico": "", "passos": 0}


def test_grafo_delega_a_agente_criado_na_tela(cadastro, monkeypatch):
    agentes.criar(_novo(), "dimi")
    decisoes = iter([grafo.Rota(proximo="lucio", instrucao="liste concorrentes", motivo="mercado"),
                     grafo.Rota(proximo="responder")])
    monkeypatch.setattr(grafo, "decidir", lambda estado: next(decisoes))
    monkeypatch.setattr(grafo, "redigir", lambda estado: "Resposta final.")
    chamadas = []

    def fake(cfg, instrucao, run_id):
        chamadas.append((cfg["id"], instrucao))
        return "Relatório do Lúcio."

    monkeypatch.setattr(grafo.especialistas, "dinamico", fake)
    final = _g().invoke(_entrada("run-din"), _cfg("run-din"))
    assert chamadas == [("lucio", "liste concorrentes")]
    assert final["relatorios"] == [{"agente": "lucio", "texto": "Relatório do Lúcio."}]
    assert final["passos"] == 1
    delegou = [a for a in atividades.listar() if a["tipo"] == "delegou"]
    assert {(a["agente"], (a["dados"] or {}).get("para")) for a in delegou} >= {("orq", "lucio"), ("lucio", "orq")}


def test_grafo_nao_delega_a_agente_pausado_ou_inexistente(cadastro, monkeypatch):
    agentes.criar(_novo(), "dimi")
    agentes.atualizar("lucio", {"ativo": False})
    agentes.atualizar("tech", {"ativo": False})
    for destino in ("lucio", "tech", "fantasma"):
        monkeypatch.setattr(grafo, "decidir", lambda estado, d=destino: grafo.Rota(proximo=d, instrucao="x"))
        monkeypatch.setattr(grafo, "redigir", lambda estado: "ok")
        monkeypatch.setattr(grafo.especialistas, "dinamico", lambda *a: pytest.fail("não devia rodar"))
        monkeypatch.setattr(grafo.especialistas, "tech", lambda *a: pytest.fail("não devia rodar"))
        final = _g().invoke(_entrada(f"run-{destino}"), _cfg(f"run-{destino}"))
        assert final["resposta"] == "ok" and not final.get("relatorios")


def test_prompt_do_supervisor_lista_agentes_ativos(cadastro):
    agentes.criar(_novo(), "dimi")
    agentes.atualizar("agenda", {"ativo": False})
    prompt = grafo._prompt_supervisor()
    assert "- lucio = pesquisa de concorrentes e mercado;" in prompt
    assert "- tech =" in prompt and "- agenda =" not in prompt


def test_prompt_dinamico_traz_regras_e_instrucoes():
    texto = especialistas._prompt_dinamico(
        {"nome": "Lúcio", "papel": "Pesquisa", "instrucoes": "Resuma em 3 linhas."}
    )
    assert "Resuma em 3 linhas." in texto and "PROPÕE" in texto and "Nada inventado" in texto


# --- Rotas ---

_SEGREDO = "segredo-de-teste-bem-longo-para-hmac"


@pytest.fixture()
def cliente(monkeypatch, cadastro):
    monkeypatch.setenv("ORION_SESSION_SECRET", _SEGREDO)
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi,estranho:senha-x")
    monkeypatch.setenv("ORION_APPROVERS", "dimi")
    import index

    importlib.reload(index)
    return TestClient(index.app, base_url="http://localhost")


def _logar(c, usuario="dimi", senha="senha-dimi"):
    assert c.post("/api/login", json={"usuario": usuario, "senha": senha}).status_code == 200


def test_rotas_exigem_sessao(cliente):
    assert cliente.get("/api/agentes").status_code == 401
    assert cliente.post("/api/agentes", json=_novo()).status_code == 401


def test_leitura_para_logado_e_escrita_so_aprovador(cliente):
    _logar(cliente, "estranho", "senha-x")
    r = cliente.get("/api/agentes")
    assert r.status_code == 200
    corpo = r.json()
    assert {a["id"] for a in corpo["agentes"]} >= set(agentes.NATIVOS)
    assert corpo["limites"]["max_ativos_criados"] == agentes.MAX_DINAMICOS_ATIVOS
    assert {c["id"] for c in corpo["catalogo"]} == set(agentes.CATALOGO)
    assert cliente.post("/api/agentes", json=_novo()).status_code == 403
    assert cliente.put("/api/agentes/tech", json={"nome": "x"}).status_code == 403
    assert cliente.delete("/api/agentes/tech").status_code == 403
    assert cliente.post("/api/agentes/tech/testar", json={"pergunta": "oi"}).status_code == 403


def test_crud_pela_rota(cliente):
    _logar(cliente)
    r = cliente.post("/api/agentes", json=_novo(ferramentas=["propor_doc"]))
    assert r.status_code == 201 and r.json()["exige_aprovacao"] is True
    assert cliente.post("/api/agentes", json=_novo(cor="azul")).status_code == 422
    r = cliente.put("/api/agentes/lucio", json={"nome": "Lúcio 2", "ativo": False})
    assert r.status_code == 200 and r.json()["nome"] == "Lúcio 2" and r.json()["ativo"] is False
    assert cliente.put("/api/agentes/fantasma", json={"nome": "x"}).status_code == 404
    assert cliente.delete("/api/agentes/tech").status_code == 422
    assert cliente.delete("/api/agentes/lucio").status_code == 200
    assert cliente.delete("/api/agentes/lucio").status_code == 404


def test_testar_agente(cliente, monkeypatch):
    _logar(cliente)
    cliente.post("/api/agentes", json=_novo())
    monkeypatch.setattr(especialistas, "dinamico", lambda cfg, p, run: f"{cfg['nome']} respondeu: {p}")
    r = cliente.post("/api/agentes/lucio/testar", json={"pergunta": "oi"})
    assert r.status_code == 200 and r.json()["resposta"] == "Lúcio respondeu: oi"
    assert cliente.post("/api/agentes/lucio/testar", json={"pergunta": "  "}).status_code == 422
    assert cliente.post("/api/agentes/orq/testar", json={"pergunta": "oi"}).status_code == 422
    assert cliente.post("/api/agentes/fantasma/testar", json={"pergunta": "oi"}).status_code == 404


def test_rascunho_pela_rota(cliente, monkeypatch):
    _logar(cliente)
    monkeypatch.setattr(agentes, "rascunho", lambda d: {"nome": "X", "descricao_recebida": d})
    r = cliente.post("/api/agentes/rascunho", json={"descricao": "um agente"})
    assert r.status_code == 200 and r.json()["descricao_recebida"] == "um agente"
    assert cliente.post("/api/agentes/rascunho", json={"descricao": " "}).status_code == 422


def test_falha_do_modelo_vira_502(cliente, monkeypatch):
    _logar(cliente)
    cliente.post("/api/agentes", json=_novo())

    def quebra(*a, **k):
        raise RuntimeError("invalid x-api-key")

    monkeypatch.setattr(especialistas, "dinamico", quebra)
    monkeypatch.setattr(agentes, "rascunho", quebra)
    r = cliente.post("/api/agentes/lucio/testar", json={"pergunta": "oi"})
    assert r.status_code == 502 and "api-key" not in r.text
    r = cliente.post("/api/agentes/rascunho", json={"descricao": "um agente"})
    assert r.status_code == 502 and "api-key" not in r.text
