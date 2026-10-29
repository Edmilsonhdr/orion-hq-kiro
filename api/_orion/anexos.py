"""Anexos: arquivos (propostas em PDF, prints) guardados no próprio banco, ligados a um documento ou negócio.

Sem serviço externo. Só tipos conhecidos e inofensivos (nada de SVG/HTML, que rodariam script); o
conteúdo nunca vem nas listagens, só no download.
"""

from __future__ import annotations

import re
from typing import Optional

from . import db

TAMANHO_MAX = 8 * 1024 * 1024  # 8 MB por arquivo
ENTIDADES = {"documento": "documentos", "negocio": "negocios"}

# extensão -> tipo MIME
TIPOS = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "gif": "image/gif",
    "txt": "text/plain",
    "csv": "text/csv",
    "md": "text/markdown",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
# Abrem no navegador (o resto baixa direto).
INLINE = {"application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"}

_COLUNAS = "id, entidade, entidade_id, nome, tipo, tamanho, autor, criado_em"


def limpar_nome(nome: str) -> str:
    base = re.split(r"[\\/]", nome or "")[-1].strip()
    base = re.sub(r"[\x00-\x1f\"<>:|?*]", "_", base)
    return base[:150]


def listar(entidade: str, entidade_id: int) -> list[dict]:
    return db.consultar(
        f"select {_COLUNAS} from anexos where entidade = %s and entidade_id = %s order by id",
        (entidade, entidade_id),
    )


def criar(entidade: str, entidade_id: int, nome: str, dados: bytes, autor: str) -> Optional[dict]:
    """Guarda o arquivo. `ValueError` (→ 422) para tipo/tamanho inválido; `None` se o dono não existe."""
    if entidade not in ENTIDADES:
        raise ValueError("Tipo de item inválido.")
    nome = limpar_nome(nome)
    if not nome:
        raise ValueError("Informe o nome do arquivo.")
    extensao = nome.rsplit(".", 1)[-1].lower() if "." in nome else ""
    if extensao not in TIPOS:
        raise ValueError("Tipo de arquivo não permitido. Use PDF, imagem, texto, CSV, Word, Excel ou PowerPoint.")
    if not dados:
        raise ValueError("O arquivo está vazio.")
    if len(dados) > TAMANHO_MAX:
        raise ValueError(f"O arquivo passa de {TAMANHO_MAX // (1024 * 1024)} MB.")
    if db.um(f"select 1 as ok from {ENTIDADES[entidade]} where id = %s", (entidade_id,)) is None:
        return None
    return db.um(
        f"""
        insert into anexos (entidade, entidade_id, nome, tipo, tamanho, conteudo, autor)
        values (%s, %s, %s, %s, %s, %s, %s) returning {_COLUNAS}
        """,
        (entidade, entidade_id, nome, TIPOS[extensao], len(dados), dados, autor),
    )


def obter(anexo_id: int) -> Optional[dict]:
    """Com o conteúdo (`bytes`), para o download."""
    linha = db.um(f"select {_COLUNAS}, conteudo from anexos where id = %s", (anexo_id,))
    if linha is not None:
        linha["conteudo"] = bytes(linha["conteudo"])
    return linha


def excluir(anexo_id: int) -> bool:
    return db.executar("delete from anexos where id = %s", (anexo_id,)) > 0
