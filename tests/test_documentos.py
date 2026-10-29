"""Testes de `_orion/documentos.py` (spec docs, tarefa 2).

Contra o Postgres efêmero da fixture `banco` (conftest.py): validação, tags, versões, arquivamento,
listagem e busca (full-text em português, fallback ILIKE, relevância, limite).
"""

import pytest

from _orion import db, documentos


def _criar(titulo="Doc", conteudo="", **kw):
    return documentos.criar(titulo, conteudo, autor=kw.pop("autor", "dimi"), **kw)


# --- criar / validar ---


def test_criar_registra_autor_e_datas(banco):
    d = _criar("Plano", "# Plano", pasta="Produto", tags=["MVP"])
    assert d["id"] and d["autor"] == "dimi"
    assert d["criado_em"] and d["atualizado_em"]
    assert d["pasta"] == "Produto" and d["tags"] == ["mvp"]


@pytest.mark.parametrize("titulo", ["", "   ", None])
def test_titulo_vazio_recusado(banco, titulo):
    with pytest.raises(ValueError):
        documentos.criar(titulo, "x", autor="dimi")
    assert db.consultar("select 1 from documentos") == []


def test_limites_de_titulo_e_conteudo(banco):
    with pytest.raises(ValueError):
        _criar("a" * (documentos.TITULO_MAX + 1))
    with pytest.raises(ValueError):
        _criar("ok", "a" * (documentos.CONTEUDO_MAX + 1))
    assert _criar("a" * documentos.TITULO_MAX)["id"]


def test_tags_normalizadas(banco):
    d = _criar(tags=[" Api ", "api", "", "Pagamento"])
    assert d["tags"] == ["api", "pagamento"]
    with pytest.raises(ValueError):
        _criar(tags=[f"t{i}" for i in range(documentos.TAGS_MAX + 1)])


def test_pasta_vazia_vira_nula(banco):
    assert _criar(pasta="  ")["pasta"] is None


# --- editar / versões ---


def test_editar_grava_versao_anterior(banco):
    d = _criar("V1", "texto 1")
    novo = documentos.editar(d["id"], {"conteudo": "texto 2"}, "jullyana")
    assert novo["conteudo"] == "texto 2"
    versoes = documentos.versoes(d["id"])
    assert len(versoes) == 1 and versoes[0]["editado_por"] == "jullyana"
    assert documentos.versao(d["id"], versoes[0]["id"])["conteudo"] == "texto 1"


def test_edicao_sem_mudanca_nao_cria_versao(banco):
    d = _criar("V1", "texto")
    documentos.editar(d["id"], {"titulo": "V1", "conteudo": "texto"}, "dimi")
    assert documentos.versoes(d["id"]) == []


def test_editar_so_pasta_ou_tags_nao_cria_versao(banco):
    d = _criar("V1", "texto")
    novo = documentos.editar(d["id"], {"pasta": "Time", "tags": ["x"]}, "dimi")
    assert novo["pasta"] == "Time" and novo["tags"] == ["x"]
    assert documentos.versoes(d["id"]) == []


def test_editar_inexistente_devolve_none(banco):
    assert documentos.editar(999, {"titulo": "x"}, "dimi") is None


def test_editar_invalido_nao_grava_versao(banco):
    d = _criar("V1", "texto")
    with pytest.raises(ValueError):
        documentos.editar(d["id"], {"conteudo": "novo", "titulo": " "}, "dimi")
    assert documentos.versoes(d["id"]) == []
    assert documentos.obter(d["id"])["conteudo"] == "texto"


def test_restaurar_cria_nova_versao_e_preserva_historico(banco):
    d = _criar("V1", "a")
    documentos.editar(d["id"], {"conteudo": "b"}, "dimi")
    primeira = documentos.versoes(d["id"])[0]["id"]  # guarda "a"
    restaurado = documentos.restaurar(d["id"], primeira, "jullyana")
    assert restaurado["conteudo"] == "a"
    contagem = documentos.versoes(d["id"])
    assert len(contagem) == 2  # "a" (original) e "b" (antes de restaurar)
    assert documentos.versao(d["id"], contagem[0]["id"])["conteudo"] == "b"


def test_restaurar_versao_inexistente(banco):
    d = _criar()
    assert documentos.restaurar(d["id"], 12345, "dimi") is None


def test_versoes_podadas_em_50(banco):
    d = _criar("V", "0")
    for i in range(1, documentos.VERSOES_MAX + 6):
        documentos.editar(d["id"], {"conteudo": str(i)}, "dimi")
    versoes = documentos.versoes(d["id"])
    assert len(versoes) == documentos.VERSOES_MAX
    # a mais recente guarda o estado imediatamente anterior ao último
    assert documentos.versao(d["id"], versoes[0]["id"])["conteudo"] == str(
        documentos.VERSOES_MAX + 4
    )


# --- arquivar / listar ---


def test_arquivados_fora_da_listagem_e_da_busca(banco):
    a = _criar("Ativo", "foguete")
    b = _criar("Velho", "foguete")
    documentos.arquivar(b["id"], True)
    assert [x["id"] for x in documentos.listar()] == [a["id"]]
    assert [x["id"] for x in documentos.buscar("foguete")] == [a["id"]]
    assert {x["id"] for x in documentos.listar(arquivados=True)} == {a["id"], b["id"]}
    assert {x["id"] for x in documentos.buscar("foguete", arquivados=True)} == {
        a["id"],
        b["id"],
    }
    documentos.arquivar(b["id"], False)
    assert len(documentos.listar()) == 2


def test_listagem_sem_conteudo_com_trecho(banco):
    _criar("Longo", "x" * 1000)
    item = documentos.listar()[0]
    assert "conteudo" not in item
    assert len(item["trecho"]) == documentos.TRECHO_MAX


def test_listagem_ordem_e_filtros(banco):
    a = _criar("A", pasta="Produto", tags=["api"])
    b = _criar("B", pasta="Time", tags=["api", "rh"])
    documentos.editar(a["id"], {"conteudo": "mudou"}, "dimi")  # A fica mais recente
    assert [x["id"] for x in documentos.listar()] == [a["id"], b["id"]]
    assert [x["id"] for x in documentos.listar(pasta="Time")] == [b["id"]]
    assert [x["id"] for x in documentos.listar(tag="RH")] == [b["id"]]
    assert len(documentos.listar(tag="api")) == 2


def test_pastas_e_tags(banco):
    _criar(pasta="Produto", tags=["api"])
    _criar(pasta="Time", tags=["rh", "api"])
    resultado = documentos.pastas_e_tags()
    assert resultado == {"pastas": ["Produto", "Time"], "tags": ["api", "rh"]}


# --- busca ---


def test_busca_full_text_com_stemming_e_acentos(banco):
    d = _criar("Decisão de preço", "Decidimos cobrar mensalidade no plano premium.")
    _criar("Outro", "nada a ver")
    achados = documentos.buscar("decisão")
    assert [x["id"] for x in achados] == [d["id"]]
    assert achados[0]["titulo"] == "Decisão de preço"
    assert [x["id"] for x in documentos.buscar("mensalidades")] == [d["id"]]


def test_busca_titulo_pesa_mais_que_conteudo(banco):
    so_conteudo = _criar("Reunião", "falamos de onboarding de clientes")
    no_titulo = _criar("Onboarding", "passo a passo")
    ids = [x["id"] for x in documentos.buscar("onboarding")]
    assert ids == [no_titulo["id"], so_conteudo["id"]]


def test_busca_trecho_marca_termo(banco):
    _criar("Notas", "início " * 20 + "o cashback será de cinco por cento " + "fim " * 20)
    trecho = documentos.buscar("cashback")[0]["trecho"]
    assert "«cashback»" in trecho


def test_busca_fallback_ilike_para_sigla(banco):
    d = _criar("Glossário", "Usamos o termo xqz9 para marcar o fluxo antigo.")
    achados = documentos.buscar("xqz")
    assert [x["id"] for x in achados] == [d["id"]]
    assert "xqz9" in achados[0]["trecho"]
    assert "conteudo" not in achados[0]


def test_busca_ilike_trata_curinga_como_texto(banco):
    d = _criar("Taxa", "A taxa é de 100% do valor")
    _criar("Outro", "sem percentual")
    assert [x["id"] for x in documentos.buscar("100%")] == [d["id"]]
    assert documentos.buscar("1_0") == []


def test_busca_sem_resultado(banco):
    _criar("Algo", "qualquer coisa")
    assert documentos.buscar("inexistentezzz") == []


def test_consulta_vazia_devolve_listagem(banco):
    _criar("A")
    _criar("B")
    assert len(documentos.buscar("   ")) == 2
    assert len(documentos.buscar("")) == 2


def test_busca_limitada_a_20(banco):
    for i in range(documentos.BUSCA_MAX + 5):
        _criar(f"Doc {i}", "palavra-chave comum")
    assert len(documentos.buscar("comum")) == documentos.BUSCA_MAX
