"""Conversas do chat: várias conversas além da "Geral" (mensagens sem `conversa_id`).

Cada conversa tem seu histórico, e é só ele que entra no contexto dos agentes (`db.historico_recente`).
A conversa "Geral" é virtual: não tem linha na tabela e reúne as mensagens com `conversa_id` nulo
(inclusive os avisos automáticos do Vigia, do GitHub e o resumo semanal).
"""

from __future__ import annotations

from typing import Any, Optional

from . import db

TITULO_MAX = 80
TITULO_PADRAO = "Nova conversa"


def _titulo(valor: Any) -> str:
    if not isinstance(valor, str) or not valor.strip():
        raise ValueError("Dê um título para a conversa.")
    titulo = " ".join(valor.split())
    if len(titulo) > TITULO_MAX:
        raise ValueError(f"Título grande demais (máximo {TITULO_MAX} caracteres).")
    return titulo


def listar() -> list[dict]:
    """Conversas ativas, a mais recente primeiro (pela última mensagem ou pela criação)."""
    return db.consultar(
        """
        select c.id, c.titulo, c.criado_por, c.criado_em,
               coalesce(max(m.criado_em), c.criado_em) as ultima_em,
               count(m.id)::int as mensagens
        from conversas c left join mensagens m on m.conversa_id = c.id
        where not c.arquivada
        group by c.id
        order by ultima_em desc, c.id desc
        """
    )


def obter(conversa_id: int) -> Optional[dict]:
    return db.um("select * from conversas where id = %s", (conversa_id,))


def ativa(conversa_id: int) -> bool:
    linha = db.um("select 1 as ok from conversas where id = %s and not arquivada", (conversa_id,))
    return linha is not None


def criar(titulo: Any, usuario: str) -> dict:
    nome = TITULO_PADRAO if titulo is None or titulo == "" else _titulo(titulo)
    linha = db.um(
        "insert into conversas (titulo, criado_por) values (%s, %s) returning *", (nome, usuario)
    )
    assert linha is not None
    return linha


def renomear(conversa_id: int, titulo: Any) -> Optional[dict]:
    return db.um(
        "update conversas set titulo = %s where id = %s returning *", (_titulo(titulo), conversa_id)
    )


def arquivar(conversa_id: int) -> Optional[dict]:
    return db.um("update conversas set arquivada = true where id = %s returning *", (conversa_id,))


def titular_se_nova(conversa_id: int, texto: str) -> None:
    """Primeira mensagem de uma conversa sem título próprio: usa o começo do texto."""
    if texto.startswith("/nota "):
        texto = texto[len("/nota "):]
    resumo = " ".join(texto.split())[:50].strip()
    if not resumo:
        return
    db.executar(
        "update conversas set titulo = %s where id = %s and titulo = %s",
        (resumo, conversa_id, TITULO_PADRAO),
    )
