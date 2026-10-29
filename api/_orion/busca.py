"""Busca global (Ctrl+K): a parte de conversas (documentos, negócios e organizações vêm dos próprios módulos)."""

from __future__ import annotations

from typing import Any

from . import db

LIMITE = 5


def _like(termo: str) -> str:
    escapado = termo.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escapado}%"


def conversas(termo: str) -> list[dict[str, Any]]:
    """Conversas cujo título ou alguma mensagem contém o termo (a "Geral" tem id nulo)."""
    termo = (termo or "").strip()
    if len(termo) < 2:
        return []
    padrao = _like(termo)
    achadas = db.consultar(
        """
        select c.id, c.titulo, null::text as trecho from conversas c
        where not c.arquivada and c.titulo ilike %s
        union all
        select * from (
          select m.conversa_id as id, c.titulo, left(m.texto, 120) as trecho
          from mensagens m left join conversas c on c.id = m.conversa_id
          where m.texto ilike %s and (c.id is null or not c.arquivada)
          order by m.id desc limit %s
        ) recentes
        """,
        (padrao, padrao, LIMITE),
    )
    vistas: set[Any] = set()
    unicas: list[dict[str, Any]] = []
    for c in achadas:
        if c["id"] in vistas:
            continue
        vistas.add(c["id"])
        unicas.append({"id": c["id"], "titulo": c["titulo"] or "Geral", "trecho": c["trecho"]})
    return unicas[:LIMITE]
