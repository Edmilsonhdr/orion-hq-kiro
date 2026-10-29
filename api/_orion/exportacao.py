"""Exportação dos documentos para markdown (backup e saída sem dependência do Orion HQ).

Gera um arquivo `.md` por documento, com frontmatter (título, pasta, tags, autor e datas), em subpastas
conforme a `pasta`. O resultado é legível em qualquer editor e reimportável (`importacao.py`): o
importador usa o primeiro `# Título` do corpo, então o título é repetido como `#` no começo do arquivo.
"""

from __future__ import annotations

import re
import unicodedata
import zipfile
from pathlib import Path, PurePosixPath
from typing import Optional

from . import documentos

_INVALIDOS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _nome_seguro(texto: str, padrao: str = "sem-titulo") -> str:
    """Nome de arquivo/pasta seguro (sem separadores, `..` ou caracteres inválidos no Windows)."""
    limpo = _INVALIDOS.sub(" ", unicodedata.normalize("NFC", texto)).strip().strip(".")
    limpo = re.sub(r"\s+", " ", limpo)[:80].strip()
    return limpo or padrao


def _aspas(valor: str) -> str:
    return '"' + valor.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ") + '"'


def _arquivo(doc: dict, pai: Optional[dict] = None) -> str:
    """Conteúdo do `.md`: frontmatter + `# Título` + corpo."""
    tags = ", ".join(_aspas(t) for t in doc["tags"])
    cabecalho = [
        "---",
        f"titulo: {_aspas(doc['titulo'])}",
        f"pasta: {_aspas(doc['pasta'])}" if doc["pasta"] else "pasta:",
        f"tags: [{tags}]",
        *( [f"pai: {_aspas(pai['titulo'])}", f"pai_pasta: {_aspas(pai['pasta'])}" if pai["pasta"] else "pai_pasta:"] if pai else [] ),
        f"autor: {_aspas(doc['autor'])}",
        f"criado_em: {doc['criado_em'].isoformat()}",
        f"atualizado_em: {doc['atualizado_em'].isoformat()}",
        f"arquivado: {'true' if doc['arquivado'] else 'false'}",
        "---",
        "",
        f"# {doc['titulo']}",
        "",
        "",
    ]
    return "\n".join(cabecalho) + (doc["conteudo"].rstrip("\n") + "\n" if doc["conteudo"] else "")


def montar(arquivados: bool = False) -> dict[str, str]:
    """Mapa `caminho relativo (posix) -> texto` dos documentos, sem colisões de nome."""
    saida: dict[str, str] = {}
    for item in documentos.listar(arquivados=arquivados):
        doc = documentos.obter(item["id"])
        if doc is None:
            continue
        pastas = [_nome_seguro(p) for p in (doc["pasta"] or "").split(" / ") if p.strip()]
        base = _nome_seguro(doc["titulo"])
        caminho = PurePosixPath(*pastas, f"{base}.md")
        n = 2
        while str(caminho).lower() in {k.lower() for k in saida}:
            caminho = PurePosixPath(*pastas, f"{base} ({n}).md")
            n += 1
        pai = documentos.obter(doc["pai_id"]) if doc.get("pai_id") else None
        saida[str(caminho)] = _arquivo(doc, pai)
    return saida


def exportar(destino: Path, arquivados: bool = False, como_zip: Optional[bool] = None) -> int:
    """Grava a exportação em uma pasta, ou em `.zip` se `destino` termina em `.zip`. Devolve a contagem."""
    arquivos = montar(arquivados)
    destino = Path(destino)
    if como_zip is None:
        como_zip = destino.suffix.lower() == ".zip"

    if como_zip:
        destino.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as pacote:
            for caminho, texto in arquivos.items():
                pacote.writestr(caminho, texto)
    else:
        for caminho, texto in arquivos.items():
            alvo = destino / caminho
            alvo.parent.mkdir(parents=True, exist_ok=True)
            alvo.write_text(texto, encoding="utf-8")
    return len(arquivos)
