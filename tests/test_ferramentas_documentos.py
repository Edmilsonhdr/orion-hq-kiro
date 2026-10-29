"""Testes das ferramentas de documentos dos agentes (spec docs, tarefa 4).

A lógica pura (`_buscar_documentos`, `_ler_documento`) roda contra o Postgres efêmero (`banco`);
o fluxo ponta a ponta usa um modelo simulado (nenhuma chamada à Anthropic), como em
`tests/test_especialistas.py`.
"""

import re
from typing import Any

from langchain_core.messages import AIMessage, ToolMessage

from _orion import atividades, documentos, especialistas, ferramentas, llm

_DATA = re.compile(r"\d{2}/\d{2}/\d{4}")


def _doc(titulo="Doc", conteudo="", **kw):
    return documentos.criar(titulo, conteudo, autor="dimi", **kw)


# --- buscar_documentos ---


def test_busca_cita_id_pasta_e_data(banco):
    d = _doc("Preço do plano", "Cobraremos R$ 19 por mês no premium.", pasta="Negócio")
    saida = ferramentas._buscar_documentos("premium")
    assert f"documento #{d['id']}" in saida
    assert "Negócio" in saida and "Preço do plano" in saida
    assert _DATA.search(saida)
    assert "premium" in saida


def test_busca_sem_pasta_nao_mostra_pasta_vazia(banco):
    d = _doc("Solto", "conteúdo único zeta")
    saida = ferramentas._buscar_documentos("zeta")
    assert f"[documento #{d['id']} · " in saida and "None" not in saida


def test_busca_nada_encontrado_diz_explicitamente(banco):
    _doc("Algo", "qualquer")
    assert "Nada encontrado nos documentos" in ferramentas._buscar_documentos("inexistentezzz")


def test_busca_consulta_vazia(banco):
    assert "Consulta vazia" in ferramentas._buscar_documentos("  ")


def test_busca_ignora_arquivados(banco):
    d = _doc("Velho", "segredo antigo")
    documentos.arquivar(d["id"], True)
    assert "Nada encontrado" in ferramentas._buscar_documentos("segredo")


# --- ler_documento ---


def test_ler_devolve_conteudo_com_cabecalho(banco):
    d = _doc("Ata", "# Reunião\nDecidimos lançar em março.", pasta="Time")
    saida = ferramentas._ler_documento(d["id"])
    assert f"documento #{d['id']} · Time" in saida
    assert "Decidimos lançar em março." in saida
    assert "truncado" not in saida


def test_ler_inexistente(banco):
    assert "Não existe documento com o id 999" in ferramentas._ler_documento(999)


def test_ler_id_invalido(banco):
    assert "Informe o número" in ferramentas._ler_documento("abc")


def test_ler_arquivado_recusa(banco):
    d = _doc("Velho", "texto")
    documentos.arquivar(d["id"], True)
    saida = ferramentas._ler_documento(d["id"])
    assert "arquivado" in saida and "texto" not in saida


def test_ler_trunca_conteudo_grande(banco):
    d = _doc("Gigante", "a" * (ferramentas._LIMITE_DOCUMENTO + 500))
    saida = ferramentas._ler_documento(d["id"])
    assert "Conteúdo truncado" in saida
    assert saida.count("a") <= ferramentas._LIMITE_DOCUMENTO + 20  # cabeçalho/aviso têm 'a'


# --- conjuntos dos especialistas ---


def test_tools_expostas_aos_especialistas():
    for conjunto in (ferramentas.FERRAMENTAS_TECH, ferramentas.FERRAMENTAS_NEGOCIOS):
        nomes = {t.name for t in conjunto}
        assert {"buscar_documentos", "ler_documento", "buscar_changelog"} <= nomes
    assert "registrar_decisao" in {t.name for t in ferramentas.FERRAMENTAS_NEGOCIOS}


def test_ferramentas_de_documentos_sao_somente_leitura():
    escrita = {"criar_documento", "editar_documento", "arquivar_documento", "atualizar_documento"}
    for conjunto in (ferramentas.FERRAMENTAS_TECH, ferramentas.FERRAMENTAS_NEGOCIOS):
        assert not escrita & {t.name for t in conjunto}


def test_prompts_mandam_consultar_documentos():
    assert "buscar_documentos" in especialistas._prompt_tech()
    assert "buscar_documentos" in especialistas._prompt_negocios()


# --- ponta a ponta com modelo simulado ---


class _Fake:
    def __init__(self, roteiro: list[AIMessage]) -> None:
        self.roteiro = list(roteiro)
        self.vistas: list[Any] = []

    def bind_tools(self, _tools: Any) -> "_Fake":
        return self

    def invoke(self, msgs: list[Any]) -> AIMessage:
        self.vistas = list(msgs)
        return self.roteiro.pop(0)


def _chama(nome: str, args: dict, id_: str) -> AIMessage:
    return AIMessage(
        content="", tool_calls=[{"name": nome, "args": args, "id": id_, "type": "tool_call"}]
    )


def test_pergunta_sobre_documento_passa_pelas_ferramentas(banco, monkeypatch):
    d = _doc("Política de reembolso", "Reembolso em até 7 dias corridos.", pasta="Negócio")
    fake = _Fake(
        [
            _chama("buscar_documentos", {"consulta": "reembolso"}, "c1"),
            _chama("ler_documento", {"documento_id": d["id"]}, "c2"),
            AIMessage(content=f'Segundo o documento #{d["id"]} "Política de reembolso": 7 dias.'),
        ]
    )
    monkeypatch.setattr(llm, "principal", lambda: fake)

    resposta = especialistas.negocios("Qual o prazo de reembolso?", "run-docs")

    assert "7 dias" in resposta
    retornos = [m.content for m in fake.vistas if isinstance(m, ToolMessage)]
    assert any(f"documento #{d['id']}" in r for r in retornos)
    assert any("Reembolso em até 7 dias corridos." in r for r in retornos)

    # Atividades registram só nome(args), nunca o conteúdo do documento (Requirement 7.4).
    detalhes = [a["detalhe"] for a in atividades.listar() if a["tipo"] == "ferramenta"]
    assert any(x.startswith("buscar_documentos(") for x in detalhes)
    assert any(x.startswith("ler_documento(") for x in detalhes)
    assert not any("Reembolso em até 7 dias" in (x or "") for x in detalhes)
