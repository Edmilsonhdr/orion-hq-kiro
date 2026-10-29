"""Testes da exportação do Docs para markdown (e ida e volta com o importador)."""

import zipfile

from _orion import documentos, exportacao, importacao


def _criar(titulo, conteudo="", **kw):
    return documentos.criar(titulo, conteudo, autor=kw.pop("autor", "dimi"), **kw)


def test_arquivo_tem_frontmatter_titulo_e_corpo(banco):
    _criar("Plano", "- item\n", pasta="Produto", tags=["mvp", "api"])
    texto = exportacao.montar()["Produto/Plano.md"]
    assert texto.startswith("---\ntitulo: \"Plano\"\npasta: \"Produto\"\ntags: [\"mvp\", \"api\"]\n")
    assert "autor: \"dimi\"" in texto and "arquivado: false" in texto
    assert "\n# Plano\n\n- item\n" in texto and texto.endswith("- item\n")


def test_pasta_aninhada_vira_subpastas_e_nomes_sao_seguros(banco):
    _criar("A/B: \"x\"?", "t", pasta="Produto / Ideias")
    _criar("..", "t")
    caminhos = set(exportacao.montar())
    assert "Produto/Ideias/A B x.md" in caminhos
    assert "sem-titulo.md" in caminhos
    assert all(".." not in c.split("/") for c in caminhos)


def test_titulos_iguais_nao_colidem_nem_por_maiuscula(banco):
    _criar("Ata", "um")
    _criar("ata", "dois")
    caminhos = list(exportacao.montar())
    assert len(caminhos) == 2 and len({c.lower() for c in caminhos}) == 2


def test_arquivados_so_com_a_opcao(banco):
    d = _criar("Velho", "x")
    documentos.arquivar(d["id"], True)
    _criar("Ativo", "y")
    assert list(exportacao.montar()) == ["Ativo.md"]
    assert sorted(exportacao.montar(arquivados=True)) == ["Ativo.md", "Velho.md"]


def test_exportar_pasta_e_zip(banco, tmp_path):
    _criar("Ata", "texto", pasta="Time")
    assert exportacao.exportar(tmp_path / "saida") == 1
    assert (tmp_path / "saida" / "Time" / "Ata.md").read_text(encoding="utf-8").count("# Ata") == 1
    assert exportacao.exportar(tmp_path / "bk" / "docs.zip") == 1
    with zipfile.ZipFile(tmp_path / "bk" / "docs.zip") as z:
        assert z.namelist() == ["Time/Ata.md"]


def test_ida_e_volta_preserva_conteudo_pasta_e_tags(banco, tmp_path):
    original = _criar(
        "Ata: \"final\"", "## Subtítulo\n\ntexto com acentuação\n- item", pasta="Time / Reuniões", tags=["x", "y"]
    )
    exportacao.exportar(tmp_path / "docs.zip")

    from _orion import db

    db.executar("delete from documentos")
    rel = importacao.importar(tmp_path / "docs.zip", aplicar=True, tag="importado")
    assert len(rel["novos"]) == 1 and not rel["erros"]

    [volta] = [documentos.obter(d["id"]) for d in documentos.listar()]
    assert volta["titulo"] == original["titulo"]
    assert volta["pasta"] == "Time / Reuniões"
    assert volta["tags"] == ["x", "y", "importado"]
    assert volta["conteudo"].strip() == original["conteudo"].strip()
    assert "---" not in volta["conteudo"]


def test_importa_frontmatter_de_markdown_comum(banco, tmp_path):
    (tmp_path / "n.md").write_text('---\ntitulo: "Do front"\ntags: ["a"]\n---\n\nCorpo', encoding="utf-8")
    importacao.importar(tmp_path, aplicar=True, tag=None)
    [d] = documentos.listar()
    assert d["titulo"] == "Do front" and d["tags"] == ["a"]
