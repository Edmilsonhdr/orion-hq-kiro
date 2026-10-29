"""Importação de documentos em markdown para o Docs (export do Notion, pastas de .md, .zip).

Notion: "Exportar → Markdown & CSV" gera páginas `.md` com um id de 32 hex no fim do nome
(`Plano de lançamento 0a1b…ef.md`) e subpastas para subpáginas. Aqui o id é removido, a primeira linha
`# Título` vira o título e as pastas viram a `pasta` do documento. Confluence: exporte as páginas para
markdown (ex.: pelo plugin/ferramenta de conversão) e importe a pasta da mesma forma.

Seguro por padrão: `importar(..., aplicar=False)` só SIMULA e devolve o que entraria. Documentos com o
mesmo título na mesma pasta são pulados (rodar de novo não duplica). Nada é sobrescrito.
"""

from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path, PurePosixPath
from typing import Iterator, Optional

from . import db, documentos

EXTENSOES = {".md", ".markdown", ".txt"}
_ID_NOTION = re.compile(r"\s+[0-9a-f]{32}$", re.IGNORECASE)
_H1 = re.compile(r"^\s*#\s+(.+?)\s*#*\s*$")


def _limpar_nome(nome: str) -> str:
    return _ID_NOTION.sub("", nome).strip()


def _arquivos(origem: Path) -> Iterator[tuple[tuple[str, ...], str, str]]:
    """Gera (pastas, nome_sem_extensao, texto) para cada arquivo de texto da origem.

    Em .zip lê direto dos membros (sem extrair no disco) e recusa caminhos suspeitos (`..`, absolutos).
    Arquivos que não são markdown/texto (csv, imagens, zips aninhados) são ignorados pelo chamador.
    """
    if origem.is_dir():
        for caminho in sorted(origem.rglob("*")):
            if caminho.is_file():
                rel = caminho.relative_to(origem)
                yield rel.parts[:-1], rel.name, caminho.read_bytes().decode("utf-8-sig", "replace")
        return

    with zipfile.ZipFile(origem) as pacote:
        for info in sorted(pacote.infolist(), key=lambda i: i.filename):
            if info.is_dir():
                continue
            caminho = PurePosixPath(info.filename)
            if caminho.is_absolute() or ".." in caminho.parts:
                continue
            if caminho.suffix.lower() not in EXTENSOES:
                yield caminho.parts[:-1], caminho.name, ""
                continue
            yield caminho.parts[:-1], caminho.name, pacote.read(info).decode("utf-8-sig", "replace")


def _frontmatter(texto: str) -> tuple[dict, str]:
    """Separa o bloco `---` do início (formato da exportação do Orion HQ) do resto do texto.

    Lê só `titulo`, `pasta` e `tags` (valores em JSON, como a exportação grava); o que não for
    entendido é ignorado. Sem frontmatter, devolve `({}, texto)`.
    """
    linhas = texto.replace("\r\n", "\n").split("\n")
    if not linhas or linhas[0].strip() != "---":
        return {}, texto
    try:
        fim = next(i for i in range(1, len(linhas)) if linhas[i].strip() == "---")
    except StopIteration:
        return {}, texto
    dados: dict = {}
    for linha in linhas[1:fim]:
        chave, _, valor = linha.partition(":")
        chave, valor = chave.strip(), valor.strip()
        if chave in ("titulo", "pasta", "tags", "pai", "pai_pasta") and valor:
            try:
                dados[chave] = json.loads(valor)
            except ValueError:
                dados[chave] = valor
    return dados, "\n".join(linhas[fim + 1 :]).lstrip("\n")


def _titulo_e_conteudo(nome_sem_ext: str, texto: str) -> tuple[str, str]:
    """Título = primeira linha `# …` (e remove essa linha do corpo); senão o nome do arquivo."""
    linhas = texto.replace("\r\n", "\n").split("\n")
    for i, linha in enumerate(linhas):
        if not linha.strip():
            continue
        achado = _H1.match(linha)
        if achado:
            corpo = "\n".join(linhas[i + 1 :]).lstrip("\n")
            return achado.group(1).strip(), corpo
        break
    return _limpar_nome(nome_sem_ext), texto.strip("\n")


def importar(
    origem: Path,
    aplicar: bool = False,
    autor: str = "importação",
    tag: Optional[str] = "importado",
) -> dict:
    """Importa a origem (pasta ou .zip). Devolve o relatório.

    Relatório: `novos` (título/pasta que entram), `pulados` (já existiam), `ignorados` (não são
    markdown/texto, ou estão vazios), `erros` (inválidos, ex.: conteúdo grande demais). Com
    `aplicar=False` nada é gravado.
    """
    origem = Path(origem)
    if not origem.exists():
        raise FileNotFoundError(f"Origem não encontrada: {origem}")

    existentes = {(d["titulo"].lower(), d["pasta"] or "") for d in documentos.listar(arquivados=True)}
    vistos: set[tuple[str, str]] = set()
    relatorio: dict = {"novos": [], "pulados": [], "ignorados": [], "erros": [], "subpaginas": 0}
    # (id criado, título do pai, pasta do pai): ligadas depois que todas as páginas existem.
    ligacoes: list[tuple[int, str, Optional[str]]] = []

    for pastas, nome, texto in _arquivos(origem):
        caminho = "/".join((*pastas, nome))
        sufixo = Path(nome).suffix.lower()
        if sufixo not in EXTENSOES:
            relatorio["ignorados"].append(caminho)
            continue

        if not texto.strip():
            relatorio["ignorados"].append(caminho)
            continue
        meta, texto = _frontmatter(texto)
        titulo, conteudo = _titulo_e_conteudo(Path(nome).stem, texto)
        if isinstance(meta.get("titulo"), str) and meta["titulo"].strip():
            titulo = meta["titulo"].strip()

        pasta = " / ".join(p for p in (_limpar_nome(x) for x in pastas) if p)[: documentos.PASTA_MAX] or None
        if isinstance(meta.get("pasta"), str) and meta["pasta"].strip():
            pasta = meta["pasta"].strip()[: documentos.PASTA_MAX]
        tags_meta = [str(t) for t in meta["tags"]] if isinstance(meta.get("tags"), list) else []
        chave = (titulo.lower(), pasta or "")
        if chave in existentes or chave in vistos:
            relatorio["pulados"].append({"titulo": titulo, "pasta": pasta})
            continue

        try:
            dados = documentos.validar_campos(
                {
                    "titulo": titulo,
                    "conteudo": conteudo,
                    "pasta": pasta,
                    "tags": [*tags_meta, *([tag] if tag else [])],
                }
            )
        except ValueError as erro:
            relatorio["erros"].append({"arquivo": caminho, "motivo": str(erro)})
            continue

        vistos.add(chave)
        if aplicar:
            criado = documentos.criar(
                dados["titulo"], dados["conteudo"], dados["pasta"], dados["tags"], autor=autor
            )
            if isinstance(meta.get("pai"), str) and meta["pai"].strip():
                pai_pasta = meta.get("pai_pasta") if isinstance(meta.get("pai_pasta"), str) else None
                ligacoes.append((criado["id"], meta["pai"].strip(), (pai_pasta or "").strip() or None))
        relatorio["novos"].append({"titulo": dados["titulo"], "pasta": dados["pasta"]})

    for filho_id, pai_titulo, pai_pasta in ligacoes:
        pai = db.um(
            "select id from documentos where lower(titulo) = lower(%s) and pasta is not distinct from %s "
            "and not arquivado order by id limit 1",
            (pai_titulo, pai_pasta),
        )
        if pai is None or pai["id"] == filho_id:
            continue
        try:
            documentos.editar(filho_id, {"pai_id": pai["id"]}, autor)
            relatorio["subpaginas"] += 1
        except ValueError:
            pass  # profundidade máxima ou ciclo: a página fica no topo

    return relatorio
