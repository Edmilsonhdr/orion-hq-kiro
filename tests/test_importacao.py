"""Testes da importação de markdown (export do Notion / pasta / zip) para o Docs."""

import zipfile

import pytest

from _orion import documentos, importacao

ID = "0a1b2c3d4e5f60718293a4b5c6d7e8f9"


def _montar(base, arquivos: dict[str, str]):
    for nome, texto in arquivos.items():
        caminho = base / nome
        caminho.parent.mkdir(parents=True, exist_ok=True)
        caminho.write_text(texto, encoding="utf-8")
    return base


def test_simulacao_nao_grava(banco, tmp_path):
    _montar(tmp_path, {f"Plano {ID}.md": "# Plano de lançamento\ntexto"})
    rel = importacao.importar(tmp_path)
    assert [d["titulo"] for d in rel["novos"]] == ["Plano de lançamento"]
    assert documentos.listar() == []


def test_notion_titulo_pasta_e_tag(banco, tmp_path):
    _montar(
        tmp_path,
        {
            f"Produto {ID}/Roadmap {ID}.md": "# Roadmap 2026\n\n- Q1: MVP\n",
            f"Produto {ID}/Ideias {ID}/Cashback {ID}.md": "sem h1, o nome vira o título",
            f"Raiz {ID}.md": "# Raiz\nconteúdo",
        },
    )
    rel = importacao.importar(tmp_path, aplicar=True, autor="dimi")
    assert len(rel["novos"]) == 3 and not rel["erros"]
    por_titulo = {d["titulo"]: d for d in documentos.listar()}
    assert por_titulo["Roadmap 2026"]["pasta"] == "Produto"
    assert por_titulo["Cashback"]["pasta"] == "Produto / Ideias"
    assert por_titulo["Raiz"]["pasta"] is None
    assert por_titulo["Raiz"]["tags"] == ["importado"] and por_titulo["Raiz"]["autor"] == "dimi"
    completo = documentos.obter(por_titulo["Roadmap 2026"]["id"])
    assert completo["conteudo"].startswith("- Q1: MVP") and "# Roadmap" not in completo["conteudo"]


def test_rodar_de_novo_nao_duplica(banco, tmp_path):
    _montar(tmp_path, {"A.md": "# A\nx", "B.md": "# B\ny"})
    importacao.importar(tmp_path, aplicar=True)
    rel = importacao.importar(tmp_path, aplicar=True)
    assert rel["novos"] == [] and len(rel["pulados"]) == 2
    assert len(documentos.listar()) == 2


def test_nao_sobrescreve_documento_existente(banco, tmp_path):
    documentos.criar("A", "meu texto", autor="dimi")
    _montar(tmp_path, {"A.md": "# A\ntexto do notion"})
    importacao.importar(tmp_path, aplicar=True)
    assert [d["trecho"] for d in documentos.listar()] == ["meu texto"]


def test_ignora_nao_markdown_e_vazios(banco, tmp_path):
    _montar(tmp_path, {"tabela.csv": "a,b", "foto.png": "x", "Vazio.md": "", "Ok.md": "# Ok\nx"})
    rel = importacao.importar(tmp_path, aplicar=True)
    assert [d["titulo"] for d in rel["novos"]] == ["Ok"]
    assert sorted(rel["ignorados"]) == ["Vazio.md", "foto.png", "tabela.csv"]


def test_conteudo_grande_demais_vira_erro_sem_parar(banco, tmp_path):
    _montar(
        tmp_path,
        {"Gigante.md": "# Gigante\n" + "a" * (documentos.CONTEUDO_MAX + 1), "Ok.md": "# Ok\nx"},
    )
    rel = importacao.importar(tmp_path, aplicar=True)
    assert [e["arquivo"] for e in rel["erros"]] == ["Gigante.md"]
    assert [d["titulo"] for d in documentos.listar()] == ["Ok"]


def test_zip_le_membros_e_recusa_caminhos_suspeitos(banco, tmp_path):
    zip_path = tmp_path / "export.zip"
    with zipfile.ZipFile(zip_path, "w") as z:
        z.writestr(f"Time {ID}/Ata {ID}.md", "# Ata\nfeito")
        z.writestr("../fora.md", "# Fora\nx")
        z.writestr("/abs.md", "# Abs\nx")
        z.writestr("dados.csv", "a,b")
    rel = importacao.importar(zip_path, aplicar=True)
    assert [(d["titulo"], d["pasta"]) for d in rel["novos"]] == [("Ata", "Time")]
    assert rel["ignorados"] == ["dados.csv"]
    assert [d["titulo"] for d in documentos.listar()] == ["Ata"]


def test_origem_inexistente(banco, tmp_path):
    with pytest.raises(FileNotFoundError):
        importacao.importar(tmp_path / "nao-existe")


def test_documento_importado_e_achado_pela_busca(banco, tmp_path):
    _montar(tmp_path, {"Política.md": "# Política de reembolso\nReembolso em 7 dias."})
    importacao.importar(tmp_path, aplicar=True)
    assert [d["titulo"] for d in documentos.buscar("reembolso")] == ["Política de reembolso"]
