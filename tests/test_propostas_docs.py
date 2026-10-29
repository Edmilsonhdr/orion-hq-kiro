"""Testes da escrita de documentos pelos agentes COM aprovação (spec docs-escrita).

Contra o Postgres efêmero (`banco`). Nenhum teste chama a Anthropic: o fluxo ponta a ponta usa um modelo
simulado. As aprovações de documento não passam pelo grafo, então `execucao.decidir_aprovacao` é chamada
direto, sem checkpointer.
"""

import importlib
from typing import Any

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage

from _orion import atividades, db, documentos, especialistas, execucao, ferramentas, llm
from _orion import propostas_docs


def _doc(titulo="Doc", conteudo="texto", **kw):
    return documentos.criar(titulo, conteudo, autor="dimi", **kw)


def _aprovacao(aprovacao_id):
    return db.um("select * from aprovacoes where id = %s", (aprovacao_id,))


def _id_da_proposta(texto: str) -> int:
    return int(texto.split("#", 1)[1].split(")", 1)[0])


def _ultimo_chat():
    return db.um("select autor, texto from mensagens order by id desc limit 1")


def _contagem_docs():
    return db.um("select count(*) as n from documentos")["n"]


# --- propor_criacao ---


def test_propor_criacao_nao_grava_documento(banco):
    texto = propostas_docs.propor_criacao("tech", "run-1", "Ata", "# Ata\nDecidimos X", "Time", ["Ata"])
    assert "PROPOSTA" in texto and "nada foi gravado" in texto
    assert _contagem_docs() == 0
    ap = _aprovacao(_id_da_proposta(texto))
    assert ap["tipo"] == "criar_documento" and ap["status"] == "pendente"
    assert ap["pedido_por"] == "tech" and ap["run_id"] == "run-1"
    assert ap["proposta"]["titulo"] == "Ata" and ap["proposta"]["tags"] == ["ata"]


def test_propor_criacao_emite_atividade_sem_conteudo(banco):
    segredo = "CONTEUDO-SECRETO-LONGO " * 5
    texto = propostas_docs.propor_criacao("negocios", "run-2", "Plano", segredo)
    ativ = [a for a in atividades.listar() if a["tipo"] == "aguardando_aprovacao"]
    assert len(ativ) == 1 and ativ[0]["agente"] == "negocios"
    assert ativ[0]["dados"]["aprovacao_id"] == _id_da_proposta(texto)
    assert "CONTEUDO-SECRETO" not in (ativ[0]["detalhe"] or "")


def test_propor_criacao_invalida_vira_texto_e_nao_cria_aprovacao(banco):
    assert "Proposta recusada" in propostas_docs.propor_criacao("tech", "r", "   ", "x")
    assert "Proposta recusada" in propostas_docs.propor_criacao("tech", "r", "t" * 201, "x")
    assert "Proposta recusada" in propostas_docs.propor_criacao(
        "tech", "r", "ok", "a" * (documentos.CONTEUDO_MAX + 1)
    )
    assert db.consultar("select 1 from aprovacoes") == []


def test_propor_sem_run_nao_registra(banco):
    assert "não há um pedido em andamento" in propostas_docs.propor_criacao("tech", None, "T", "x")
    assert db.consultar("select 1 from aprovacoes") == []


def test_limite_de_propostas_por_run(banco):
    for i in range(propostas_docs.LIMITE_POR_RUN):
        assert "Proposta registrada" in propostas_docs.propor_criacao("tech", "run-x", f"D{i}", "x")
    assert "Limite" in propostas_docs.propor_criacao("tech", "run-x", "D4", "x")
    assert "Proposta registrada" in propostas_docs.propor_criacao("tech", "outro-run", "D", "x")


# --- propor_edicao ---


def test_propor_edicao_guarda_base_e_so_o_que_muda(banco):
    d = _doc("Plano", "v1", pasta="Time")
    texto = propostas_docs.propor_edicao(
        "negocios", "run-3", d["id"], titulo="Plano", conteudo="v2", pasta="Time"
    )
    ap = _aprovacao(_id_da_proposta(texto))
    assert ap["tipo"] == "editar_documento"
    assert ap["proposta"]["campos"] == {"conteudo": "v2"}  # título e pasta iguais ficam de fora
    assert ap["proposta"]["documento_titulo"] == "Plano"
    assert ap["proposta"]["base_atualizado_em"]
    assert documentos.obter(d["id"])["conteudo"] == "v1"  # nada gravado
    assert documentos.versoes(d["id"]) == []


@pytest.mark.parametrize(
    "preparar,esperado",
    [
        (lambda: 999, "não existe documento"),
        (lambda: _arquivado(), "arquivado"),
    ],
)
def test_propor_edicao_recusa_inexistente_e_arquivado(banco, preparar, esperado):
    texto = propostas_docs.propor_edicao("tech", "r", preparar(), conteudo="x")
    assert "Proposta recusada" in texto and esperado in texto
    assert db.consultar("select 1 from aprovacoes") == []


def _arquivado():
    d = _doc("Velho")
    documentos.arquivar(d["id"], True)
    return d["id"]


def test_propor_edicao_sem_mudanca_ou_invalida(banco):
    d = _doc("Plano", "v1")
    assert "nenhuma mudança" in propostas_docs.propor_edicao("tech", "r", d["id"], conteudo="v1")
    assert "nenhuma mudança" in propostas_docs.propor_edicao("tech", "r", d["id"])
    assert "Proposta recusada" in propostas_docs.propor_edicao("tech", "r", d["id"], titulo="  ")
    assert "(id) do documento" in propostas_docs.propor_edicao("tech", "r", "abc", conteudo="x")
    assert db.consultar("select 1 from aprovacoes") == []


# --- decidir: aprovar / recusar ---


def test_aprovar_criacao_cria_documento_com_autor_e_avisa(banco):
    ap_id = _id_da_proposta(
        propostas_docs.propor_criacao("tech", "run-4", "Ata", "# Ata", "Time", ["x"])
    )
    resultado = execucao.decidir_aprovacao(ap_id, "dimi", True)
    assert resultado["status"] == "respondido"
    docs = documentos.listar()
    assert len(docs) == 1 and docs[0]["titulo"] == "Ata"
    assert docs[0]["autor"] == "tech (aprovado por dimi)" and docs[0]["pasta"] == "Time"
    assert _aprovacao(ap_id)["status"] == "aprovada"
    chat = _ultimo_chat()
    assert chat["autor"] == "Orquestrador" and f"/docs/{docs[0]['id']}" in chat["texto"]
    assert "dimi aprovou" in chat["texto"]
    assert any(a["tipo"] == "concluiu" and a["agente"] == "tech" for a in atividades.listar())


def test_recusar_nao_grava_nada(banco):
    ap_id = _id_da_proposta(propostas_docs.propor_criacao("tech", "run-5", "Ata", "x"))
    execucao.decidir_aprovacao(ap_id, "jullyana", False)
    assert _contagem_docs() == 0
    assert _aprovacao(ap_id)["status"] == "recusada"
    assert "jullyana recusou" in _ultimo_chat()["texto"]


def test_segunda_decisao_perde_e_nao_aplica_duas_vezes(banco):
    ap_id = _id_da_proposta(propostas_docs.propor_criacao("tech", "run-6", "Ata", "x"))
    assert execucao.decidir_aprovacao(ap_id, "dimi", True)["status"] == "respondido"
    assert execucao.decidir_aprovacao(ap_id, "jullyana", True) == {"status": "ja_decidida"}
    assert _contagem_docs() == 1


def test_aprovar_edicao_gera_versao_e_autor_da_edicao(banco):
    d = _doc("Plano", "v1")
    ap_id = _id_da_proposta(
        propostas_docs.propor_edicao("negocios", "run-7", d["id"], conteudo="v2")
    )
    execucao.decidir_aprovacao(ap_id, "dimi", True)
    assert documentos.obter(d["id"])["conteudo"] == "v2"
    versoes = documentos.versoes(d["id"])
    assert len(versoes) == 1 and versoes[0]["editado_por"] == "negocios (aprovado por dimi)"
    assert documentos.versao(d["id"], versoes[0]["id"])["conteudo"] == "v1"
    assert "atualizado" in _ultimo_chat()["texto"]


# --- edição desatualizada ---


@pytest.mark.parametrize("mudanca", ["editou", "arquivou"])
def test_edicao_obsoleta_nao_aplica(banco, mudanca):
    d = _doc("Plano", "v1")
    ap_id = _id_da_proposta(propostas_docs.propor_edicao("tech", "run-8", d["id"], conteudo="v2"))
    if mudanca == "editou":
        documentos.editar(d["id"], {"conteudo": "alguém mexeu"}, "jullyana")
    else:
        documentos.arquivar(d["id"], True)
    execucao.decidir_aprovacao(ap_id, "dimi", True)
    assert _aprovacao(ap_id)["status"] == "obsoleta"
    assert documentos.obter(d["id"])["conteudo"] != "v2"
    assert "Não apliquei" in _ultimo_chat()["texto"]


# --- erro e nova tentativa ---


def test_falha_ao_aplicar_vira_erro_e_retry_aplica_sem_duplicar(banco, monkeypatch):
    ap_id = _id_da_proposta(propostas_docs.propor_criacao("tech", "run-9", "Ata", "x"))
    original = documentos.criar

    def quebra(*a, **k):
        raise RuntimeError("banco caiu")

    monkeypatch.setattr(documentos, "criar", quebra)
    resultado = execucao.decidir_aprovacao(ap_id, "dimi", True)
    assert resultado["status"] == "erro"
    assert _aprovacao(ap_id)["status"] == "erro" and _contagem_docs() == 0

    monkeypatch.setattr(documentos, "criar", original)
    assert execucao.retomar_aprovacao(ap_id)["status"] == "respondido"
    assert _contagem_docs() == 1 and _aprovacao(ap_id)["status"] == "aprovada"
    # Retomar de novo não é possível (já não está em erro).
    assert execucao.retomar_aprovacao(ap_id) == {"status": "nao_retomavel"}
    assert _contagem_docs() == 1


def test_aplicar_e_idempotente_pelo_marcador(banco):
    ap_id = _id_da_proposta(propostas_docs.propor_criacao("tech", "run-10", "Ata", "x"))
    ap = _aprovacao(ap_id)
    primeiro = propostas_docs.aplicar(ap, "dimi")
    ap = _aprovacao(ap_id)  # relê: agora com `aplicado_documento_id`
    segundo = propostas_docs.aplicar(ap, "dimi")
    assert primeiro["documento_id"] == segundo["documento_id"] and _contagem_docs() == 1


# --- reuniões continuam como estavam ---


def test_aprovacao_de_reuniao_nao_vai_pelo_caminho_de_documento(banco, monkeypatch):
    chamado = []
    monkeypatch.setattr(execucao, "_decidir_documento", lambda *a, **k: chamado.append(1))
    monkeypatch.setattr(execucao, "_retomar", lambda *a, **k: {"status": "respondido"})
    row = db.um(
        "insert into aprovacoes (run_id, chave, tipo, proposta) values "
        "('r','r:1','criar_reuniao','{}'::jsonb) returning id"
    )
    assert execucao.decidir_aprovacao(row["id"], "dimi", True) == {"status": "respondido"}
    assert chamado == []


# --- ferramentas e contexto ---


def test_tools_de_proposta_nos_conjuntos_e_sem_escrita_direta():
    for conjunto in (ferramentas.FERRAMENTAS_TECH, ferramentas.FERRAMENTAS_NEGOCIOS):
        nomes = {t.name for t in conjunto}
        assert {"propor_documento", "propor_edicao_documento"} <= nomes
        assert not {"criar_documento", "editar_documento", "arquivar_documento"} & nomes


def test_tool_usa_agente_e_run_do_contexto(banco):
    token = ferramentas.contexto.set(("negocios", "run-ctx"))
    try:
        saida = ferramentas.propor_documento.invoke({"titulo": "Via tool", "conteudo": "oi"})
    finally:
        ferramentas.contexto.reset(token)
    ap = _aprovacao(_id_da_proposta(saida))
    assert ap["pedido_por"] == "negocios" and ap["run_id"] == "run-ctx"
    assert _contagem_docs() == 0


def test_prompts_explicam_que_proposta_depende_de_aprovacao():
    for prompt in (especialistas._prompt_tech(), especialistas._prompt_negocios()):
        assert "propor_documento" in prompt and "aprovar" in prompt


def test_args_longos_sao_truncados_no_log():
    texto = especialistas._formatar_args({"titulo": "T", "conteudo": "x" * 5000})
    assert len(texto) < 200 and texto.startswith("titulo='T'")


# --- ponta a ponta com modelo simulado ---


class _Fake:
    def __init__(self, roteiro: list[AIMessage]) -> None:
        self.roteiro = list(roteiro)

    def bind_tools(self, _t: Any) -> "_Fake":
        return self

    def invoke(self, _m: list[Any]) -> AIMessage:
        return self.roteiro.pop(0)


def _chama(nome: str, args: dict, id_: str) -> AIMessage:
    return AIMessage(content="", tool_calls=[{"name": nome, "args": args, "id": id_, "type": "tool_call"}])


def test_ponta_a_ponta_agente_propoe_socio_aprova(banco, monkeypatch):
    fake = _Fake(
        [
            _chama(
                "propor_documento",
                {"titulo": "Ata 28/10", "conteudo": "# Ata\n- lançar em março", "pasta": "Reuniões"},
                "c1",
            ),
            AIMessage(content="Propus o documento “Ata 28/10”; aguarda aprovação."),
        ]
    )
    monkeypatch.setattr(llm, "principal", lambda: fake)

    resposta = especialistas.tech("Registre a ata em Docs", "run-e2e")
    assert "aguarda aprovação" in resposta
    assert _contagem_docs() == 0  # o agente não gravou

    pendente = db.listar_aprovacoes("pendente")
    assert len(pendente) == 1 and pendente[0]["tipo"] == "criar_documento"
    # contexto restaurado depois do loop
    assert ferramentas.contexto.get() == ("agente", None)

    execucao.decidir_aprovacao(pendente[0]["id"], "dimi", True)
    docs = documentos.listar()
    assert [d["titulo"] for d in docs] == ["Ata 28/10"]
    # o documento aprovado já é encontrado pela busca dos agentes
    assert "Ata 28/10" in ferramentas._buscar_documentos("março")


# --- rota HTTP ---


def test_rota_de_aprovacao_aplica_documento(monkeypatch, banco):
    monkeypatch.setenv("ORION_SESSION_SECRET", "segredo-de-teste-bem-longo-para-hmac")
    monkeypatch.setenv("ORION_USERS", "dimi:senha-dimi,visita:senha-v")
    monkeypatch.setenv("ORION_APPROVERS", "dimi")
    import index

    importlib.reload(index)
    cliente = TestClient(index.app, base_url="http://localhost")

    ap_id = _id_da_proposta(propostas_docs.propor_criacao("tech", "run-http", "Via HTTP", "x"))
    cliente.post("/api/login", json={"usuario": "visita", "senha": "senha-v"})
    assert cliente.post(f"/api/aprovacoes/{ap_id}", json={"aprovado": True}).status_code == 403
    assert _contagem_docs() == 0

    cliente.post("/api/login", json={"usuario": "dimi", "senha": "senha-dimi"})
    assert cliente.post(f"/api/aprovacoes/{ap_id}", json={"aprovado": True}).status_code == 200
    assert _contagem_docs() == 1
